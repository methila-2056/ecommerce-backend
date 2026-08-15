import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validateBody, validateParams } from '../../shared/middleware/validate.js';
import * as paymentController from './payment.controller.js';
import * as validators from './payment.validators.js';

const router = Router();

// Starts or resumes payment for a pending order.
router.post(
  '/checkout',
  authenticate,
  validateBody(validators.checkoutSchema),
  paymentController.createCheckout,
);

// Dev-only gateway simulator (the mock provider signs a real webhook).
router.post(
  '/mock/notify',
  authenticate,
  authorize('ADMIN'),
  validateBody(validators.mockNotifySchema),
  paymentController.mockNotify,
);

// Staff can refund any order; customers may only read their own payment.
router.get(
  '/:orderId',
  authenticate,
  validateParams(validators.orderIdParamSchema),
  paymentController.getPayment,
);
router.post(
  '/:orderId/refund',
  authenticate,
  authorize('ADMIN', 'SUPPORT'),
  validateParams(validators.orderIdParamSchema),
  validateBody(validators.refundSchema),
  paymentController.refundOrder,
);

export default router;
