import { Types } from 'mongoose';
import { AppError } from '../../shared/errors/AppError.js';
import { recordAudit } from '../../shared/utils/audit.js';
import {
  buildPaginationMeta,
  toPageOptions,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import { Product } from '../catalog/product.model.js';
import { Order } from '../order/order.model.js';
import { User } from '../user/user.model.js';
import { Review, type ReviewStatus } from './review.model.js';

export interface ReviewPublic {
  id: string;
  productId: string;
  userId: string;
  reviewerName: string;
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  moderationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReviewRow {
  _id: unknown;
  productId: { toString(): string };
  userId: { toString(): string };
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  moderationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  reviewer?: { name?: string | null } | null;
}

function toReviewPublic(r: ReviewRow): ReviewPublic {
  return {
    id: (r._id as { toString(): string }).toString(),
    productId: r.productId.toString(),
    userId: r.userId.toString(),
    reviewerName: r.reviewer?.name ?? 'Anonymous',
    rating: r.rating,
    title: r.title,
    body: r.body,
    isVerifiedPurchase: r.isVerifiedPurchase,
    status: r.status,
    moderationReason: r.moderationReason,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createReview(
  userId: string,
  productId: string,
  input: { rating: number; title?: string; body: string },
): Promise<ReviewPublic> {
  const product = await Product.exists({ _id: productId, status: 'published', isActive: true });
  if (!product) throw AppError.notFound('Product not found');

  const existing = await Review.exists({ productId, userId });
  if (existing) {
    throw AppError.conflict('You have already reviewed this product', {
      errorCode: 'REVIEW_EXISTS',
    });
  }

  // Verified purchases are auto-approved; unreviewed-by-purchase submissions
  // are moderated. Look for a delivered order containing this product.
  const verifiedOrder = await Order.findOne({
    userId,
    status: 'delivered',
    'items.productId': productId,
  }).lean();

  const review = await Review.create({
    productId,
    userId,
    orderId: verifiedOrder ? verifiedOrder._id : null,
    rating: input.rating,
    title: input.title ?? '',
    body: input.body,
    isVerifiedPurchase: verifiedOrder !== null,
    status: verifiedOrder ? 'approved' : 'pending',
  });

  recordAudit(
    'review.created',
    { reviewId: review._id.toString(), productId },
    { actorId: userId },
  );
  return toReviewPublic(review.toObject() as unknown as ReviewRow);
}

export async function updateOwnReview(
  userId: string,
  reviewId: string,
  input: { rating?: number; title?: string; body?: string },
): Promise<ReviewPublic> {
  const review = await Review.findOne({ _id: reviewId, userId });
  if (!review) throw AppError.notFound('Review not found');

  if (input.rating !== undefined) review.rating = input.rating;
  if (input.title !== undefined) review.title = input.title;
  if (input.body !== undefined) review.body = input.body;
  await review.save();

  recordAudit('review.updated', { reviewId }, { actorId: userId });
  return toReviewPublic(review.toObject() as unknown as ReviewRow);
}

export async function deleteReview(
  userId: string,
  reviewId: string,
  isStaff: boolean,
): Promise<void> {
  const review = isStaff
    ? await Review.findById(reviewId)
    : await Review.findOne({ _id: reviewId, userId });
  if (!review) throw AppError.notFound('Review not found');
  await review.deleteOne();
  recordAudit('review.deleted', { reviewId }, { actorId: userId });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listReviews(
  productId: string,
  query: { page?: number; limit?: number; status?: ReviewStatus },
  isStaff: boolean,
): Promise<{ reviews: ReviewPublic[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = { productId };
  // Public listings only show approved reviews; staff may filter by status.
  if (isStaff) {
    if (query.status) filter.status = query.status;
  } else {
    filter.status = 'approved';
  }

  const options = toPageOptions(query);
  const [total, reviews] = await Promise.all([
    Review.countDocuments(filter),
    Review.find(filter).sort({ createdAt: -1 }).skip(options.skip).limit(options.limit).lean(),
  ]);

  const userIds = [...new Set(reviews.map((r) => r.userId.toString()))];
  const users = await User.find({ _id: { $in: userIds } })
    .select('name')
    .lean();
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return {
    reviews: reviews.map((r) =>
      toReviewPublic({ ...r, reviewer: { name: nameById.get(r.userId.toString()) ?? null } }),
    ),
    meta: buildPaginationMeta(total, options),
  };
}

export async function productRatingSummary(productId: string): Promise<{
  average: number;
  count: number;
  distribution: Record<number, number>;
}> {
  const rows = await Review.aggregate([
    { $match: { productId: new Types.ObjectId(productId), status: 'approved' } },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 },
      },
    },
  ]);

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let weighted = 0;
  for (const row of rows as Array<{ _id: number; count: number }>) {
    distribution[row._id] = row.count;
    total += row.count;
    weighted += row._id * row.count;
  }
  return { average: total > 0 ? weighted / total : 0, count: total, distribution };
}

// ---------------------------------------------------------------------------
// Moderation (staff)
// ---------------------------------------------------------------------------

export async function moderateReview(
  reviewId: string,
  action: 'approve' | 'reject',
  reason: string,
  actorId: string,
): Promise<ReviewPublic> {
  const review = await Review.findById(reviewId);
  if (!review) throw AppError.notFound('Review not found');

  review.status = action === 'approve' ? 'approved' : 'rejected';
  review.moderationReason = action === 'reject' ? reason || 'Rejected by moderator' : null;
  await review.save();

  recordAudit('review.moderated', { reviewId, action, reason }, { actorId });
  return toReviewPublic(review.toObject() as unknown as ReviewRow);
}

// Internal: checked by admin dashboards (top rated, lowest rated).
export async function listAllReviews(query: {
  page?: number;
  limit?: number;
  status?: ReviewStatus;
}): Promise<{ reviews: ReviewPublic[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  const options = toPageOptions(query);
  const [total, reviews] = await Promise.all([
    Review.countDocuments(filter),
    Review.find(filter).sort({ createdAt: -1 }).skip(options.skip).limit(options.limit).lean(),
  ]);
  const userIds = [...new Set(reviews.map((r) => r.userId.toString()))];
  const users = await User.find({ _id: { $in: userIds } })
    .select('name')
    .lean();
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));
  return {
    reviews: reviews.map((r) =>
      toReviewPublic({ ...r, reviewer: { name: nameById.get(r.userId.toString()) ?? null } }),
    ),
    meta: buildPaginationMeta(total, options),
  };
}
