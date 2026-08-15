import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../shared/middleware/validate.js';

import * as couponController from './coupon.controller.js';
import * as validators from './coupon.validators.js';

const router = Router();

// Admin coupon management.
router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'SUPPORT'),
  validateQuery(validators.listCouponsQuerySchema),
  couponController.listCoupons,
);
router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  validateBody(validators.createCouponSchema),
  couponController.createCoupon,
);
router.patch(
  '/:couponId',
  authenticate,
  authorize('ADMIN'),
  validateParams(validators.couponIdParamSchema),
  validateBody(validators.updateCouponSchema),
  couponController.updateCoupon,
);
router.delete(
  '/:couponId',
  authenticate,
  authorize('ADMIN'),
  validateParams(validators.couponIdParamSchema),
  couponController.deleteCoupon,
);

// Checkout helper: confirms a code against the current cart contents without
// consuming it. Items mirror the order module's DiscountCartItem shape.
router.post(
  '/validate/:code',
  authenticate,
  validateParams(validators.couponCodeParamSchema),
  validateBody(validators.validateCouponSchema),
  couponController.validateCoupon,
);

export default router;
