import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export interface IReview {
  productId: Types.ObjectId;
  userId: Types.ObjectId;
  // Set when the reviewer's order for this product is delivered — powers the
  // "verified purchase" badge. Null when the customer never ordered the item.
  orderId: Types.ObjectId | null;
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  moderationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReviewDocument = HydratedDocument<IReview>;

const reviewSchema = new Schema<IReview, Model<IReview>>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    rating: { type: Number, required: true, min: MIN_RATING, max: MAX_RATING },
    title: { type: String, trim: true, maxlength: 120 },
    body: { type: String, trim: true, required: true, maxlength: 2000 },
    isVerifiedPurchase: { type: Boolean, default: false },
    status: { type: String, enum: REVIEW_STATUSES, default: 'pending' },
    moderationReason: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);

// One review per customer per product.
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ status: 1, productId: 1, createdAt: -1 });

export const Review = model<IReview, Model<IReview>>('Review', reviewSchema);
