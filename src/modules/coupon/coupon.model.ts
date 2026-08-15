import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export const COUPON_TYPES = ['percentage', 'fixed'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

// Coupons are a single collection with scope control:
//   appliesTo 'all'            -> whole cart
//   appliesTo 'category'       -> only items whose product.category is listed
//   appliesTo 'product'        -> only items whose productId is listed
export const COUPON_SCOPES = ['all', 'category', 'product'] as const;
export type CouponScope = (typeof COUPON_SCOPES)[number];

export interface ICoupon {
  code: string;
  type: CouponType;
  value: number; // percentage (0-100) or fixed amount in cents
  scope: CouponScope;
  productIds: Types.ObjectId[];
  categoryIds: Types.ObjectId[];
  minOrderValueCents: number;
  maxDiscountCents: number | null;
  maxUses: number | null;
  perUserLimit: number;
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CouponDocument = HydratedDocument<ICoupon>;

const couponSchema = new Schema<ICoupon, Model<ICoupon>>(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 50 },
    type: { type: String, enum: COUPON_TYPES, required: true },
    value: { type: Number, required: true, min: 0 },
    scope: { type: String, enum: COUPON_SCOPES, default: 'all' },
    productIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Product' },
    categoryIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Category' },
    minOrderValueCents: { type: Number, default: 0, min: 0 },
    maxDiscountCents: { type: Number, default: null, min: 0 },
    maxUses: { type: Number, default: null, min: 1 },
    perUserLimit: { type: Number, default: 1, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

couponSchema.index({ code: 1 }, { unique: true });

export const Coupon = model<ICoupon, Model<ICoupon>>('Coupon', couponSchema);
