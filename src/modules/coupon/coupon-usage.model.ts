import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

// One row per coupon redemption (user + coupon). Used to enforce the
// per-user usage limit and to power the "coupon usage" admin statistic.
export interface ICouponUsage {
  couponId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId | null;
  discountCents: number;
  usedAt: Date;
}

export type CouponUsageDocument = HydratedDocument<ICouponUsage>;

const couponUsageSchema = new Schema<ICouponUsage, Model<ICouponUsage>>(
  {
    couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    discountCents: { type: Number, default: 0, min: 0 },
    usedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true, versionKey: false },
);

// Speeds up per-user usage counting during checkout (countDocuments checks
// inside the checkout transaction). The coupon's usedCount is incremented
// atomically via $inc in the same transaction, and the order module re-checks
// both limits there before committing the redemption.
couponUsageSchema.index({ couponId: 1, userId: 1 });

export const CouponUsage = model<ICouponUsage, Model<ICouponUsage>>(
  'CouponUsage',
  couponUsageSchema,
);
