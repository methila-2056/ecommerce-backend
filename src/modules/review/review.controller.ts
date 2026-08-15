import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import { sendSuccess } from '../../shared/utils/response.js';
import * as reviewService from './review.service.js';
import type { ReviewStatus } from './review.model.js';

function requireUser(req: Request): { userId: string; isStaff: boolean } {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  const roles = req.user.roles;
  return { userId: req.user.userId, isStaff: roles.includes('ADMIN') || roles.includes('SUPPORT') };
}

export async function createReview(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { productId } = req.params as { productId: string };
  const body = req.body as { rating: number; title?: string; body: string };
  const review = await reviewService.createReview(userId, productId, body);
  sendSuccess(res, review, 'Review submitted successfully', undefined, 201);
}

export async function updateReview(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { reviewId } = req.params as { reviewId: string };
  const body = req.body as { rating?: number; title?: string; body?: string };
  const review = await reviewService.updateOwnReview(userId, reviewId, body);
  sendSuccess(res, review, 'Review updated successfully');
}

export async function deleteReview(req: Request, res: Response): Promise<void> {
  const { userId, isStaff } = requireUser(req);
  const { reviewId } = req.params as { reviewId: string };
  await reviewService.deleteReview(userId, reviewId, isStaff);
  sendSuccess(res, null, 'Review deleted successfully');
}

export async function listReviews(req: Request, res: Response): Promise<void> {
  const { productId } = req.params as { productId: string };
  const query = req.query as { page?: number; limit?: number; status?: ReviewStatus };
  const result = await reviewService.listReviews(productId, query, false);
  sendSuccess(res, result.reviews, 'Reviews retrieved successfully', result.meta);
}

export async function ratingSummary(req: Request, res: Response): Promise<void> {
  const { productId } = req.params as { productId: string };
  const summary = await reviewService.productRatingSummary(productId);
  sendSuccess(res, summary, 'Rating summary retrieved successfully');
}

export async function adminListReviews(req: Request, res: Response): Promise<void> {
  const query = req.query as { page?: number; limit?: number; status?: ReviewStatus };
  const result = await reviewService.listAllReviews(query);
  sendSuccess(res, result.reviews, 'Reviews retrieved successfully', result.meta);
}

export async function moderateReview(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { reviewId } = req.params as { reviewId: string };
  const body = req.body as { action: 'approve' | 'reject'; reason?: string };
  const review = await reviewService.moderateReview(
    reviewId,
    body.action,
    body.reason ?? '',
    userId,
  );
  sendSuccess(res, review, 'Review moderated successfully');
}
