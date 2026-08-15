import { z } from 'zod';
import { MAX_RATING, MIN_RATING, REVIEW_STATUSES } from './review.model.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier format');

export const createReviewSchema = z.object({
  rating: z
    .number()
    .int()
    .min(MIN_RATING, `Rating must be between ${MIN_RATING} and ${MAX_RATING}`)
    .max(MAX_RATING),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1, 'Review body is required').max(2000),
});

export const updateReviewSchema = z
  .object({
    rating: z.number().int().min(MIN_RATING).max(MAX_RATING).optional(),
    title: z.string().trim().max(120).optional(),
    body: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

export const productIdParamSchema = z.object({
  productId: objectIdSchema,
});

export const reviewIdParamSchema = z.object({
  reviewId: objectIdSchema,
});

export const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(REVIEW_STATUSES).optional(),
});

export const moderateReviewSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    reason: z.string().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === 'reject' && !val.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason is required when rejecting',
      });
    }
  });
