import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export const PAYMENT_STATUSES = [
  'created',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface IPaymentRefund {
  amountCents: number;
  reason: string;
  refundReference: string;
  at: Date;
}

export interface IPayment {
  // Client-supplied key that makes checkout idempotent: the unique index
  // guarantees a double-submit cannot create two payments for one order.
  idempotencyKey: string;
  orderId: Types.ObjectId;
  userId: Types.ObjectId;
  provider: string;
  // Gateway's identifier for the payment, unique per provider.
  providerReference: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  refundedCents: number;
  refunds: IPaymentRefund[];
  // Gateway event ids already processed — replays are acknowledged but
  // ignored, keeping side effects exactly-once.
  processedWebhookIds: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentDocument = HydratedDocument<IPayment>;

const paymentRefundSchema = new Schema<IPaymentRefund>(
  {
    amountCents: { type: Number, required: true, min: 0 },
    reason: { type: String, default: '', maxlength: 1000 },
    refundReference: { type: String, default: null },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const paymentSchema = new Schema<IPayment, Model<IPayment>>(
  {
    idempotencyKey: { type: String, required: true, trim: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, required: true, lowercase: true, trim: true },
    providerReference: { type: String, required: true, trim: true },
    amountCents: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'USD', maxlength: 3 },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'created' },
    refundedCents: { type: Number, default: 0, min: 0 },
    refunds: { type: [paymentRefundSchema], default: [] },
    processedWebhookIds: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

// Idempotency guard: one payment per client key.
paymentSchema.index({ idempotencyKey: 1 }, { unique: true });
// A gateway reference is unique within a provider (MockProvider randomUUIDs,
// real gateways guarantee the same).
paymentSchema.index({ provider: 1, providerReference: 1 }, { unique: true });

export const Payment = model<IPayment, Model<IPayment>>('Payment', paymentSchema);
