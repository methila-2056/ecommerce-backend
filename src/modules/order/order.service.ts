import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import { recordAudit } from '../../shared/utils/audit.js';
import {
  buildPaginationMeta,
  toPageOptions,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import { Cart } from '../cart/cart.model.js';
import { Product } from '../catalog/product.model.js';
import { Coupon } from '../coupon/coupon.model.js';
import { CouponUsage } from '../coupon/coupon-usage.model.js';
import { computeDiscount, type DiscountCartItem } from '../coupon/coupon.service.js';
import {
  deductStock,
  releaseStock,
  restock,
  reserveStock,
} from '../inventory/inventory.service.js';
import { notify } from '../notification/notification.service.js';
import { User } from '../user/user.model.js';
import {
  Order,
  ORDER_STATUSES,
  type IOrderItem,
  type IShippingAddress,
  type OrderDocument,
  type OrderStatus,
} from './order.model.js';

// ---------------------------------------------------------------------------
// State machine — every transition is validated against this table so a
// DELIVERED order can never become PROCESSING (illegal backward jumps are
// rejected before any side effect runs).
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled', 'refund_requested'],
  processing: ['packed', 'cancelled', 'refund_requested'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['refund_requested'],
  refund_requested: ['refunded', 'delivered'],
  refunded: [],
  cancelled: [],
};

function assertTransition(from: OrderStatus, to: OrderStatus, context: string): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw AppError.conflict(`Cannot move an order from "${from}" to "${to}" (${context})`, {
      errorCode: 'INVALID_ORDER_TRANSITION',
    });
  }
}

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface OrderItemPublic {
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  image: string | null;
  attributes: Record<string, string>;
  unitPriceCents: number;
  taxRate: number;
  taxAmountCents: number;
  discountCents: number;
  lineTotalCents: number;
  quantity: number;
}

export interface OrderPublic {
  id: string;
  orderNumber: string;
  userId: string;
  items: OrderItemPublic[];
  subtotalCents: number;
  discountTotalCents: number;
  couponCode: string | null;
  couponDiscountCents: number;
  taxTotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  shippingAddress: IShippingAddress;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; note: string; changedBy: string | null; at: string }[];
  paymentId: string | null;
  paymentStatus: string | null;
  stockDeducted: boolean;
  placedAt: string;
  cancelledAt: string | null;
  cancelledReason: string | null;
  refunds: {
    amountCents: number;
    reason: string;
    status: string;
    paymentRefundId: string | null;
    at: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

function toOrderItemPublic(item: IOrderItem): OrderItemPublic {
  return {
    productId: item.productId.toString(),
    variantId: item.variantId.toString(),
    sku: item.sku,
    name: item.name,
    image: item.image,
    attributes: item.attributes,
    unitPriceCents: item.unitPriceCents,
    taxRate: item.taxRate,
    taxAmountCents: item.taxAmountCents,
    discountCents: item.discountCents,
    lineTotalCents: item.lineTotalCents,
    quantity: item.quantity,
  };
}

export function toOrderPublic(order: OrderDocument): OrderPublic {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    userId: order.userId.toString(),
    items: order.items.map(toOrderItemPublic),
    subtotalCents: order.subtotalCents,
    discountTotalCents: order.discountTotalCents,
    couponCode: order.couponCode,
    couponDiscountCents: order.couponDiscountCents,
    taxTotalCents: order.taxTotalCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    currency: order.currency,
    shippingAddress: order.shippingAddress,
    status: order.status,
    statusHistory: order.statusHistory.map((h) => ({
      status: h.status,
      note: h.note,
      changedBy: h.changedBy,
      at: h.at.toISOString(),
    })),
    paymentId: order.paymentId?.toString() ?? null,
    paymentStatus: order.paymentStatus,
    stockDeducted: order.stockDeducted,
    placedAt: order.placedAt.toISOString(),
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelledReason: order.cancelledReason,
    refunds: order.refunds.map((r) => ({
      amountCents: r.amountCents,
      reason: r.reason,
      status: r.status,
      paymentRefundId: r.paymentRefundId,
      at: r.at.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Checkout: create order + reserve stock inside a single transaction
// ---------------------------------------------------------------------------

function generateOrderNumber(): string {
  const now = new Date();
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `ORD-${yyyymmdd}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export interface ShippingAddressInput {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

async function resolveShippingAddress(
  userId: string,
  input: { shippingAddressId?: string; shippingAddress?: ShippingAddressInput },
): Promise<IShippingAddress> {
  if (input.shippingAddressId) {
    const user = await User.findById(userId).lean();
    const address = user?.addresses?.find(
      (a) => (a._id as { toString(): string }).toString() === input.shippingAddressId,
    );
    if (!address)
      throw AppError.badRequest('Shipping address not found', { errorCode: 'ADDRESS_NOT_FOUND' });
    return {
      fullName: address.recipient,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? null,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
    };
  }
  if (input.shippingAddress) {
    const a = input.shippingAddress;
    return {
      fullName: a.fullName,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2 ?? null,
      city: a.city,
      state: a.state,
      postalCode: a.postalCode,
      country: a.country,
    };
  }
  throw AppError.badRequest('A shipping address is required', {
    errorCode: 'SHIPPING_ADDRESS_REQUIRED',
  });
}

export interface CreateOrderInput {
  shippingAddressId?: string;
  shippingAddress?: ShippingAddressInput;
  couponCode?: string;
}

export async function createOrder(userId: string, input: CreateOrderInput): Promise<OrderPublic> {
  const cart = await Cart.findOne({ userId });
  if (!cart || cart.items.length === 0) {
    throw AppError.badRequest('Cart is empty', { errorCode: 'EMPTY_CART' });
  }

  const shippingAddress = await resolveShippingAddress(userId, input);

  const variantIds = cart.items.map((i) => i.variantId.toString());
  const products = await Product.find({ 'variants._id': { $in: variantIds } }).lean();

  // Build authoritative line items from the database, never from the client.
  const orderItems: IOrderItem[] = [];
  for (const item of cart.items) {
    const product = products.find((p) =>
      (p.variants as unknown as Array<{ _id: unknown }>).some(
        (v) => (v._id as { toString(): string }).toString() === item.variantId.toString(),
      ),
    );
    const variant = product
      ? (
          product.variants as unknown as Array<{
            _id: unknown;
            sku: string;
            attributes: Record<string, string>;
            priceCents: number;
            compareAtPriceCents: number | null;
            taxRate: number;
            stock: { available: number };
            isActive: boolean;
            images: string[];
          }>
        ).find((v) => (v._id as { toString(): string }).toString() === item.variantId.toString())
      : undefined;

    if (!product || !variant) {
      throw AppError.badRequest('An item in your cart is no longer available', {
        errorCode: 'ITEM_UNAVAILABLE',
      });
    }
    if (product.status !== 'published' || product.isActive !== true || !variant.isActive) {
      throw AppError.badRequest(`"${product.name}" is no longer available`, {
        errorCode: 'ITEM_UNAVAILABLE',
      });
    }

    orderItems.push({
      productId: product._id,
      variantId: item.variantId,
      sku: variant.sku,
      name: product.name,
      image: product.images[0] ?? variant.images[0] ?? null,
      attributes: variant.attributes,
      unitPriceCents: variant.priceCents,
      taxRate: variant.taxRate,
      taxAmountCents: 0,
      discountCents: 0,
      lineTotalCents: 0,
      quantity: item.quantity,
    });
  }

  const subtotalCents = orderItems.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

  // Coupon discount (server-computed against the same authoritative items).
  let couponDiscountCents = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const discount = await computeDiscount(
      input.couponCode,
      userId,
      orderItems.map((i) => ({
        productId: i.productId.toString(),
        category:
          products.find((p) => p._id.toString() === i.productId.toString())?.category?.toString() ??
          null,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
      })) satisfies DiscountCartItem[],
    );
    couponDiscountCents = discount.discountCents;
    couponId = discount.couponId;
    couponCode = discount.code;
  }

  // Allocate the coupon discount across line items proportional to their share
  // of the subtotal, with largest-remainder rounding so the per-item discounts
  // sum exactly to the coupon total (which itself is capped at the eligible
  // subtotal by computeDiscount).
  if (couponDiscountCents > 0) {
    let allocated = 0;
    orderItems.forEach((item, i) => {
      const share =
        i === orderItems.length - 1
          ? couponDiscountCents - allocated
          : Math.floor(
              ((item.unitPriceCents * item.quantity) / subtotalCents) * couponDiscountCents,
            );
      item.discountCents = share;
      allocated += share;
    });
  }

  const taxTotalCents = orderItems.reduce(
    (sum, i) => sum + Math.round((i.unitPriceCents * i.quantity * i.taxRate) / 100),
    0,
  );
  const shippingCents =
    subtotalCents >= env.FREE_SHIPPING_THRESHOLD_CENTS ? 0 : env.SHIPPING_FLAT_CENTS;
  const totalCents = Math.max(
    0,
    subtotalCents - couponDiscountCents + taxTotalCents + shippingCents,
  );

  for (const item of orderItems) {
    item.taxAmountCents = Math.round((item.unitPriceCents * item.quantity * item.taxRate) / 100);
    item.lineTotalCents = item.unitPriceCents * item.quantity - item.discountCents;
  }

  // The checkout transaction guarantees atomicity across three collections:
  // product stock (reservation), the order document, and the cart. If any step
  // fails (e.g. stock sold out mid-checkout), everything rolls back and no
  // stock is left reserved.
  const orderNumber = generateOrderNumber();
  const session = await mongoose.startSession();
  try {
    const created = await session.withTransaction(async (): Promise<OrderDocument> => {
      for (const item of orderItems) {
        await reserveStock(
          item.productId.toString(),
          item.variantId.toString(),
          item.quantity,
          `order ${orderNumber}`,
          { referenceType: 'order', referenceId: orderNumber },
          session,
        );
      }

      // Re-check coupon limits inside the transaction (the pre-check above is
      // for fast feedback; the count + unique index here are authoritative).
      if (couponId) {
        const coupon = await Coupon.findById(couponId).session(session);
        if (!coupon)
          throw AppError.badRequest('Invalid coupon code', { errorCode: 'INVALID_COUPON' });
        const usage = await CouponUsage.countDocuments({ couponId, userId }).session(session);
        if (usage >= coupon.perUserLimit) {
          throw AppError.badRequest('You have already used this coupon', {
            errorCode: 'COUPON_USER_LIMIT_REACHED',
          });
        }
        if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
          throw AppError.badRequest('This coupon has reached its usage limit', {
            errorCode: 'COUPON_EXHAUSTED',
          });
        }
      }

      const docs = await Order.create(
        [
          {
            orderNumber,
            userId,
            items: orderItems,
            subtotalCents,
            discountTotalCents: couponDiscountCents,
            couponCode,
            couponDiscountCents,
            taxTotalCents,
            shippingCents,
            totalCents,
            currency: 'USD',
            shippingAddress,
            status: 'pending',
            statusHistory: [
              { status: 'pending', note: 'Order placed', changedBy: userId, at: new Date() },
            ],
            paymentStatus: 'pending',
            stockDeducted: false,
          },
        ],
        { session },
      );
      const order = docs[0];
      if (!order) throw AppError.internal('Failed to create order');

      await Cart.deleteOne({ userId }).session(session);

      if (couponId) {
        await CouponUsage.create(
          [{ couponId, userId, orderId: order._id, discountCents: couponDiscountCents }],
          { session },
        );
        await Coupon.updateOne({ _id: couponId }, { $inc: { usedCount: 1 } }).session(session);
      }
      return order;
    });

    recordAudit(
      'order.created',
      { orderId: created._id.toString(), orderNumber: created.orderNumber, totalCents },
      { actorId: userId },
    );
    notify(
      userId,
      'order_placed',
      'Order placed',
      `Your order ${created.orderNumber} has been received.`,
    );
    return toOrderPublic(created);
  } finally {
    await session.endSession();
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getOrderById(orderId: string, userId?: string): Promise<OrderPublic> {
  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (userId && order.userId.toString() !== userId) throw AppError.notFound('Order not found');
  return toOrderPublic(order);
}

export async function listCustomerOrders(
  userId: string,
  query: { page?: number; limit?: number; status?: OrderStatus },
): Promise<{ orders: OrderPublic[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = { userId };
  if (query.status) filter.status = query.status;
  const options = toPageOptions(query);
  const [total, orders] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter).sort({ placedAt: -1 }).skip(options.skip).limit(options.limit),
  ]);
  return { orders: orders.map(toOrderPublic), meta: buildPaginationMeta(total, options) };
}

export async function listAdminOrders(query: {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  userId?: string;
  orderNumber?: string;
  from?: string;
  to?: string;
}): Promise<{ orders: OrderPublic[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.userId) filter.userId = query.userId;
  if (query.orderNumber) filter.orderNumber = new RegExp(query.orderNumber, 'i');
  if (query.from || query.to) {
    const placedRange: Record<string, Date> = {};
    if (query.from) placedRange.$gte = new Date(query.from);
    if (query.to) placedRange.$lte = new Date(query.to);
    filter.placedAt = placedRange;
  }
  const options = toPageOptions(query);
  const [total, orders] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter).sort({ placedAt: -1 }).skip(options.skip).limit(options.limit),
  ]);
  return { orders: orders.map(toOrderPublic), meta: buildPaginationMeta(total, options) };
}

// ---------------------------------------------------------------------------
// Order lifecycle
// ---------------------------------------------------------------------------

function pushStatusHistory(
  order: OrderDocument,
  status: OrderStatus,
  note: string,
  changedBy: string | null,
): void {
  order.statusHistory.push({ status, note, changedBy, at: new Date() });
}

// Payment succeeded → confirm the order and convert reservations into sales.
export async function markOrderPaid(orderId: string, paymentId: string): Promise<OrderPublic> {
  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (order.status !== 'pending' && order.status !== 'confirmed') {
    throw AppError.conflict('Order cannot be confirmed from its current status', {
      errorCode: 'INVALID_ORDER_TRANSITION',
    });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const item of order.items) {
        await deductStock(
          item.productId.toString(),
          item.variantId.toString(),
          item.quantity,
          `order ${order.orderNumber} paid`,
          { referenceType: 'order', referenceId: order._id.toString() },
          session,
        );
      }
      assertTransition(order.status, 'confirmed', 'payment confirmation');
      order.status = 'confirmed';
      order.paymentStatus = 'paid';
      order.paymentId = new mongoose.Types.ObjectId(paymentId);
      order.stockDeducted = true;
      pushStatusHistory(order, 'confirmed', 'Payment received, order confirmed', 'system');
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }

  recordAudit('order.status_changed', { orderId, from: 'pending', to: 'confirmed' });
  notify(
    order.userId.toString(),
    'order_confirmed',
    'Order confirmed',
    `Payment received for order ${order.orderNumber}.`,
  );
  return toOrderPublic(order);
}

// Payment failed → release the reservation so the stock is sellable again;
// the customer can retry payment on the same pending order.
export async function markOrderPaymentFailed(orderId: string): Promise<OrderPublic> {
  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (order.stockDeducted) {
    throw AppError.conflict('Order was already paid; refund instead of marking payment failed', {
      errorCode: 'INVALID_ORDER_TRANSITION',
    });
  }
  for (const item of order.items) {
    await releaseStock(
      item.productId.toString(),
      item.variantId.toString(),
      item.quantity,
      `order ${order.orderNumber} payment failed`,
      { referenceType: 'order', referenceId: order._id.toString() },
    );
  }
  order.paymentStatus = 'failed';
  await order.save();
  recordAudit('order.status_changed', { orderId, note: 'payment_failed' });
  notify(
    order.userId.toString(),
    'payment_failed',
    'Payment failed',
    `Payment for order ${order.orderNumber} could not be completed.`,
  );
  return toOrderPublic(order);
}

// Retry payment on a pending order whose previous payment attempt failed:
// re-reserve stock (it was released on failure) and reset payment status.
export async function prepareOrderForPayment(orderId: string): Promise<OrderPublic> {
  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (order.status !== 'pending' || order.paymentStatus !== 'failed') {
    throw AppError.conflict('Only pending orders with a failed payment can be retried', {
      errorCode: 'INVALID_ORDER_TRANSITION',
    });
  }
  for (const item of order.items) {
    await reserveStock(
      item.productId.toString(),
      item.variantId.toString(),
      item.quantity,
      `order ${order.orderNumber} retry`,
      { referenceType: 'order', referenceId: order._id.toString() },
    );
  }
  order.paymentStatus = 'pending';
  await order.save();
  return toOrderPublic(order);
}

export interface AdminTransitionInput {
  to: OrderStatus;
  note?: string;
}

export async function adminTransitionOrder(
  orderId: string,
  input: AdminTransitionInput,
  actorId: string,
): Promise<OrderPublic> {
  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  const fromStatus = order.status;
  assertTransition(fromStatus, input.to, 'admin transition');

  if (input.to === 'cancelled') {
    return cancelOrder(order, input.note ?? '', actorId, true);
  }

  order.status = input.to;
  pushStatusHistory(order, input.to, input.note ?? '', actorId);
  await order.save();
  recordAudit('order.status_changed', { orderId, from: fromStatus, to: input.to, actorId });

  if (input.to === 'shipped') {
    notify(
      order.userId.toString(),
      'order_shipped',
      'Order shipped',
      `Your order ${order.orderNumber} is on its way.`,
    );
  } else if (input.to === 'delivered') {
    notify(
      order.userId.toString(),
      'order_delivered',
      'Order delivered',
      `Your order ${order.orderNumber} was delivered.`,
    );
  }
  return toOrderPublic(order);
}

export async function cancelOrderByCustomer(
  orderId: string,
  userId: string,
  reason?: string,
): Promise<OrderPublic> {
  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (order.userId.toString() !== userId) throw AppError.notFound('Order not found');

  if (order.status === 'pending' && order.paymentStatus !== 'paid') {
    return cancelOrder(order, reason ?? 'Cancelled by customer', userId, false);
  }
  if (order.status === 'confirmed' || order.status === 'processing') {
    assertTransition(order.status, 'refund_requested', 'customer cancellation of paid order');
    order.status = 'refund_requested';
    order.refunds.push({
      amountCents: order.totalCents,
      reason: reason ?? 'Cancelled after payment',
      status: 'requested',
      paymentRefundId: null,
      at: new Date(),
    });
    pushStatusHistory(order, 'refund_requested', 'Cancellation requested after payment', userId);
    await order.save();
    recordAudit('order.refund_requested', { orderId, actorId: userId });
    notify(
      order.userId.toString(),
      'refund_requested',
      'Refund requested',
      `We are processing your refund for order ${order.orderNumber}.`,
    );
    return toOrderPublic(order);
  }

  throw AppError.conflict('Order cannot be cancelled from its current status', {
    errorCode: 'INVALID_ORDER_TRANSITION',
  });
}

export async function requestRefund(
  orderId: string,
  userId: string,
  reason: string,
): Promise<OrderPublic> {
  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (order.userId.toString() !== userId) throw AppError.notFound('Order not found');
  assertTransition(order.status, 'refund_requested', 'customer refund request');

  order.status = 'refund_requested';
  order.refunds.push({
    amountCents: order.totalCents,
    reason,
    status: 'requested',
    paymentRefundId: null,
    at: new Date(),
  });
  pushStatusHistory(order, 'refund_requested', reason, userId);
  await order.save();
  recordAudit('order.refund_requested', { orderId, actorId: userId });
  notify(
    order.userId.toString(),
    'refund_requested',
    'Refund requested',
    `Your refund request for order ${order.orderNumber} has been received.`,
  );
  return toOrderPublic(order);
}

// Called by the payment module once the provider confirms a refund. Restocks
// the returned goods (the sale was already deducted) and finalizes state.
export async function finalizeRefund(
  orderId: string,
  amountCents: number,
  reason: string,
  paymentRefundId: string,
  actorId: string,
): Promise<OrderPublic> {
  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'refunded') {
    throw AppError.conflict('Only paid orders can be refunded', {
      errorCode: 'INVALID_ORDER_TRANSITION',
    });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (order.stockDeducted) {
        for (const item of order.items) {
          await restock(
            item.productId.toString(),
            item.variantId.toString(),
            item.quantity,
            `order ${order.orderNumber} refunded`,
            actorId,
          );
        }
        order.stockDeducted = false;
      }
      order.paymentStatus = 'refunded';
      order.status = 'refunded';
      const refund = order.refunds.at(-1);
      if (refund) {
        refund.status = 'processed';
        refund.paymentRefundId = paymentRefundId;
        refund.amountCents = amountCents;
      } else {
        order.refunds.push({
          amountCents,
          reason,
          status: 'processed',
          paymentRefundId,
          at: new Date(),
        });
      }
      pushStatusHistory(order, 'refunded', reason, actorId);
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }

  recordAudit('payment.refunded', { orderId, amountCents, actorId });
  notify(
    order.userId.toString(),
    'refund_processed',
    'Refund processed',
    `A refund of $${(amountCents / 100).toFixed(2)} was issued for order ${order.orderNumber}.`,
  );
  return toOrderPublic(order);
}

async function cancelOrder(
  order: OrderDocument,
  reason: string,
  actorId: string,
  isAdmin: boolean,
): Promise<OrderPublic> {
  assertTransition(
    order.status,
    'cancelled',
    isAdmin ? 'admin cancellation' : 'customer cancellation',
  );

  const wasPaid = order.paymentStatus === 'paid';
  for (const item of order.items) {
    if (wasPaid) {
      await restock(
        item.productId.toString(),
        item.variantId.toString(),
        item.quantity,
        `order ${order.orderNumber} cancelled`,
        actorId,
      );
    } else {
      await releaseStock(
        item.productId.toString(),
        item.variantId.toString(),
        item.quantity,
        `order ${order.orderNumber} cancelled`,
        { referenceType: 'order', referenceId: order._id.toString() },
      );
    }
  }

  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.cancelledReason = reason;
  order.paymentStatus = wasPaid ? 'refunded' : 'failed';
  order.stockDeducted = false;
  pushStatusHistory(order, 'cancelled', reason, actorId);
  await order.save();

  recordAudit('order.cancelled', { orderId: order._id.toString(), reason, actorId });
  notify(
    order.userId.toString(),
    'order_cancelled',
    'Order cancelled',
    `Order ${order.orderNumber} was cancelled.`,
  );
  return toOrderPublic(order);
}

export { ORDER_STATUSES };
