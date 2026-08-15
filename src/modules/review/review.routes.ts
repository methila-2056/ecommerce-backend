import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../shared/middleware/validate.js';
import * as reviewController from './review.controller.js';
import * as validators from './review.validators.js';

const router = Router();

// Customer-facing review endpoints are mounted at the product path so the
// frontend can fetch them from the same base the catalog lives on.
router.get(
  '/products/:productId/reviews',
  validateParams(validators.productIdParamSchema),
  validateQuery(validators.listReviewsQuerySchema),
  reviewController.listReviews,
);
router.get(
  '/products/:productId/reviews/rating',
  validateParams(validators.productIdParamSchema),
  reviewController.ratingSummary,
);
router.post(
  '/products/:productId/reviews',
  authenticate,
  validateParams(validators.productIdParamSchema),
  validateBody(validators.createReviewSchema),
  reviewController.createReview,
);

// Customers manage their own review.
router.patch(
  '/reviews/:reviewId',
  authenticate,
  validateParams(validators.reviewIdParamSchema),
  validateBody(validators.updateReviewSchema),
  reviewController.updateReview,
);
router.delete(
  '/reviews/:reviewId',
  authenticate,
  validateParams(validators.reviewIdParamSchema),
  reviewController.deleteReview,
);

// Moderation queue (staff only).
router.get(
  '/admin/reviews',
  authenticate,
  authorize('ADMIN', 'SUPPORT'),
  validateQuery(validators.listReviewsQuerySchema),
  reviewController.adminListReviews,
);
router.patch(
  '/admin/reviews/:reviewId/moderate',
  authenticate,
  authorize('ADMIN', 'SUPPORT'),
  validateParams(validators.reviewIdParamSchema),
  validateBody(validators.moderateReviewSchema),
  reviewController.moderateReview,
);

export default router;
