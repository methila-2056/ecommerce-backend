import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import { recordAudit } from '../../shared/utils/audit.js';
import { Order, type OrderDocument } from '../order/order.model.js';
import * as orderService from '../order/order.service.js';
import { User } from '../user/user.model.js';
import {
  Payment,
  type IPaymentRefund,
  type PaymentDocument,
  type PaymentStatus,
} from './payment.model.js';
import {
  getPaymentProvider,
  registerPaymentProvider,
  type WebhookEvent,
} from './payment.provider.js';
import { MockPaymentProvider } from './payment.providers/mock.provider.js';

// The mock provider is the default gateway. Importing this module registers it
// in the provider registry, so any code path that touches payments gets a
// working provider.
registerPaymentProvider(new MockPaymentProvider());

export interface PaymentPublic {
  id: string;
  orderId: string;
  userId: string;
  provider: string;
  providerReference: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  refundedCents: number;
  refunds: Array<{ amountCents: number; reason: string; refundReference: string; at: string }>;
  createdAt: string;
  updatedAt: string;
}

function toPaymentPublic(payment: PaymentDocument): PaymentPublic {
  return {
    id: payment._id.toString(),
    orderId: payment.orderId.toString(),
    userId: payment.userId.toString(),
    provider: payment.provider,
    providerReference: payment.providerReference,
    amountCents: payment.amountCents,
    currency: payment.currency,
    status: payment.status,
    refundedCents: payment.refundedCents,
    refunds: payment.refunds.map((r) => ({
      amountCents: r.amountCents,
      reason: r.reason,
      refundReference: r.refundReference,
      at: r.at.toISOString(),
    })),
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export interface CheckoutResult {
  payment: PaymentPublic;
  order: OrderPublic;
}

// Starts (or resumes) payment for a pending order. Safe to call repeatedly:
//  - an in-flight payment attempt (status 'created') is reused, not duplicated;
//  - a failed attempt re-reserves the released stock and starts a fresh one;
//  - the provider-level idempotency key + unique index stop double inserts.
export async function createCheckout(
  orderId: string,
  userId: string,
  opts?: { provider?: string },
): Promise<CheckoutResult> {
  const order = await Order.findById(orderId);
  if (!order || order.userId.toString() !== userId) throw AppError.notFound('Order not found');
  if (order.status !== 'pending') {
    throw AppError.conflict('Only pending orders can be checked out', {
      errorCode: 'ORDER_NOT_PAYABLE',
    });
  }
  if (order.paymentStatus === 'failed') {
    await orderService.prepareOrderForPayment(orderId);
  }

  let payment = await Payment.findOne({ orderId, status: { $in: ['created'] } }).sort({
    createdAt: -1,
  });
  if (!payment) {
    const user = await User.findById(userId).lean();
    const provider = getPaymentProvider(opts?.provider ?? env.PAYMENT_PROVIDER);
    const idempotencyKey = `ck_${orderId}_${randomUUID()}`;
    const result = await provider.createPayment({
      idempotencyKey,
      orderId,
      customer: {
        id: userId,
        email: user?.email ?? '',
        name: user?.name ?? '',
      },
      amountCents: order.totalCents,
      currency: order.currency,
    });

    try {
      payment = await Payment.create({
        idempotencyKey,
        orderId,
        userId,
        provider: provider.name,
        providerReference: result.providerReference,
        amountCents: order.totalCents,
        currency: order.currency,
        status: 'created',
        metadata: result.raw,
      });
    } catch (error) {
      // Unique index collision on idempotencyKey (concurrent double-submit of
      // the same checkout) — load the winner and proceed with it.
      if ((error as { code?: number }).code === 11000) {
        payment = await Payment.findOne({ idempotencyKey }).sort({ createdAt: -1 });
        if (!payment) throw AppError.internal('Checkout conflict could not be resolved');
      } else {
        throw error;
      }
    }

    if (result.status === 'succeeded') {
      await applyPaymentSucceeded(payment);
    }
  }

  return { payment: toPaymentPublic(payment), order: toOrderPublicSafe(order) };
}

// ---------------------------------------------------------------------------
// Webhook handling (raw body + HMAC signature)
// ---------------------------------------------------------------------------

export interface WebhookResult {
  acknowledged: boolean;
  handled: boolean;
  duplicate?: boolean;
}

// Called by the raw-body webhook route. `providerName` comes from the URL, so a
// single endpoint can serve multiple gateways. All side effects are applied
// through `handleEvent`, which is the single place order/payment state changes.
export async function processWebhook(
  providerName: string,
  rawBody: Buffer,
  signature: string,
): Promise<WebhookResult> {
  const provider = getPaymentProvider(providerName);
  const event = await provider.verifyWebhook(rawBody, signature);

  const payment = await Payment.findOne({
    provider: providerName,
    providerReference: event.providerReference,
  });
  if (!payment) {
    // The provider keeps retrying unacknowledged events, so acknowledge
    // orphans to stop the retry loop. Log them for manual reconciliation.
    recordAudit('payment.webhook_orphan', {
      providerReference: event.providerReference,
      type: event.type,
    });
    return { acknowledged: true, handled: false };
  }

  // Reject anything that does not match the payment we stored (tampering /
  // misrouted webhook). Refund events carry the refunded amount, not the
  // original charge, so they are exempt from the amount check.
  if (event.type !== 'refund.succeeded' && event.amountCents !== payment.amountCents) {
    throw AppError.badRequest('Webhook amount does not match the stored payment', {
      errorCode: 'WEBHOOK_AMOUNT_MISMATCH',
    });
  }

  if (payment.processedWebhookIds.includes(event.webhookId)) {
    return { acknowledged: true, handled: false, duplicate: true };
  }

  await handleEvent(payment, event);
  return { acknowledged: true, handled: true };
}

async function handleEvent(payment: PaymentDocument, event: WebhookEvent): Promise<void> {
  payment.processedWebhookIds.push(event.webhookId);
  switch (event.type) {
    case 'payment.succeeded':
      if (payment.status !== 'succeeded') {
        await applyPaymentSucceeded(payment);
      } else {
        await payment.save();
      }
      break;
    case 'payment.failed':
      if (payment.status === 'created') {
        await applyPaymentFailed(payment);
      } else {
        await payment.save();
      }
      break;
    case 'refund.succeeded':
      await applyRefundSucceeded(
        payment,
        event.amountCents,
        event.reason ?? '',
        event.refundReference ?? '',
      );
      break;
    default:
      throw AppError.badRequest('Unsupported webhook event type', {
        errorCode: 'UNSUPPORTED_WEBHOOK_EVENT',
      });
  }
}

// ---------------------------------------------------------------------------
// Side effects (the only place order + payment state mutate together)
// ---------------------------------------------------------------------------

async function applyPaymentSucceeded(payment: PaymentDocument): Promise<void> {
  await orderService.markOrderPaid(payment.orderId.toString(), payment._id.toString());
  payment.status = 'succeeded';
  await payment.save();
  recordAudit('payment.succeeded', {
    paymentId: payment._id.toString(),
    orderId: payment.orderId.toString(),
  });
}

async function applyPaymentFailed(payment: PaymentDocument): Promise<void> {
  await orderService.markOrderPaymentFailed(payment.orderId.toString());
  payment.status = 'failed';
  await payment.save();
  recordAudit('payment.failed', {
    paymentId: payment._id.toString(),
    orderId: payment.orderId.toString(),
  });
}

async function applyRefundSucceeded(
  payment: PaymentDocument,
  amountCents: number,
  reason: string,
  refundReference: string,
): Promise<void> {
  const refund: IPaymentRefund = { amountCents, reason, refundReference, at: new Date() };
  payment.refunds.push(refund);
  payment.refundedCents += amountCents;
  payment.status = payment.refundedCents >= payment.amountCents ? 'refunded' : 'partially_refunded';
  await payment.save();
  await orderService.finalizeRefund(
    payment.orderId.toString(),
    amountCents,
    reason,
    refundReference,
    'system',
  );
}

// ---------------------------------------------------------------------------
// Reads & refunds
// ---------------------------------------------------------------------------

export async function getPaymentByOrder(orderId: string, userId?: string): Promise<PaymentPublic> {
  const payment = await Payment.findOne({ orderId }).sort({ createdAt: -1 });
  if (!payment) throw AppError.notFound('Payment not found');
  if (userId && payment.userId.toString() !== userId) throw AppError.notFound('Payment not found');
  return toPaymentPublic(payment);
}

export async function refundOrder(
  orderId: string,
  input: { amountCents?: number; reason?: string },
  actorId: string,
): Promise<PaymentPublic> {
  const payment = await Payment.findOne({
    orderId,
    status: { $in: ['succeeded', 'partially_refunded'] },
  }).sort({ createdAt: -1 });
  if (!payment) throw AppError.notFound('No payable payment found for this order');

  const amountCents = input.amountCents ?? payment.amountCents - payment.refundedCents;
  if (amountCents <= 0) throw AppError.badRequest('Refund amount must be positive');

  const provider = getPaymentProvider(payment.provider);
  const result = await provider.refundPayment(payment.providerReference, {
    amountCents,
    reason: input.reason,
  });
  await applyRefundSucceeded(payment, amountCents, input.reason ?? '', result.refundReference);

  recordAudit('payment.refund_processed', { orderId, amountCents, actorId });
  return toPaymentPublic(payment);
}

// Order state used by the checkout response (imported lazily to avoid a
// circular import at module-evaluation time).
type OrderPublic = ReturnType<typeof orderService.toOrderPublic>;

function toOrderPublicSafe(order: OrderDocument): OrderPublic {
  return orderService.toOrderPublic(order);
}
