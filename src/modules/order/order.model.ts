import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'refund_requested',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

// All money is integer cents. Order documents are immutable snapshots of what
// the customer paid for at purchase time — product prices may change later but
// the order keeps its own figures (price/tax/discount snapshots).
export interface IOrderItem {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
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

export interface IShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface IOrderStatusEvent {
  status: OrderStatus;
  note: string;
  changedBy: string | null;
  at: Date;
}

export interface IOrderRefund {
  amountCents: number;
  reason: string;
  status: 'requested' | 'processed' | 'rejected';
  paymentRefundId: string | null;
  at: Date;
}

export interface IOrder {
  orderNumber: string;
  userId: Types.ObjectId;
  items: IOrderItem[];
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
  statusHistory: IOrderStatusEvent[];
  paymentId: Types.ObjectId | null;
  paymentStatus: OrderPaymentStatus | null;
  stockDeducted: boolean;
  placedAt: Date;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  refunds: IOrderRefund[];
  createdAt: Date;
  updatedAt: Date;
}

export type OrderDocument = HydratedDocument<IOrder>;

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: null },
    attributes: { type: Schema.Types.Mixed, default: {} },
    unitPriceCents: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    taxAmountCents: { type: Number, default: 0, min: 0 },
    discountCents: { type: Number, default: 0, min: 0 },
    lineTotalCents: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const orderStatusEventSchema = new Schema<IOrderStatusEvent>(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    note: { type: String, default: '', maxlength: 500 },
    changedBy: { type: String, default: null },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const orderRefundSchema = new Schema<IOrderRefund>(
  {
    amountCents: { type: Number, required: true, min: 0 },
    reason: { type: String, default: '', maxlength: 1000 },
    status: { type: String, enum: ['requested', 'processed', 'rejected'], default: 'requested' },
    paymentRefundId: { type: String, default: null },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const shippingAddressSchema = new Schema<IOrder['shippingAddress']>(
  {
    fullName: { type: String, required: true, maxlength: 100 },
    phone: { type: String, required: true, maxlength: 30 },
    line1: { type: String, required: true, maxlength: 200 },
    line2: { type: String, default: null, maxlength: 200 },
    city: { type: String, required: true, maxlength: 100 },
    state: { type: String, required: true, maxlength: 100 },
    postalCode: { type: String, required: true, maxlength: 20 },
    country: { type: String, required: true, maxlength: 2 },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder, Model<IOrder>>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    subtotalCents: { type: Number, required: true, min: 0 },
    discountTotalCents: { type: Number, default: 0, min: 0 },
    couponCode: { type: String, default: null },
    couponDiscountCents: { type: Number, default: 0, min: 0 },
    taxTotalCents: { type: Number, default: 0, min: 0 },
    shippingCents: { type: Number, default: 0, min: 0 },
    totalCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    shippingAddress: { type: shippingAddressSchema, required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    statusHistory: { type: [orderStatusEventSchema], default: [] },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    paymentStatus: { type: String, enum: ORDER_PAYMENT_STATUSES, default: null },
    stockDeducted: { type: Boolean, default: false },
    placedAt: { type: Date, default: () => new Date() },
    cancelledAt: { type: Date, default: null },
    cancelledReason: { type: String, default: null, maxlength: 500 },
    refunds: { type: [orderRefundSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

// Admin query shapes: orders by status, orders by customer, recent orders.
orderSchema.index({ status: 1, placedAt: -1 });
orderSchema.index({ userId: 1, placedAt: -1 });
orderSchema.index({ placedAt: -1 });

export const Order = model<IOrder, Model<IOrder>>('Order', orderSchema);
