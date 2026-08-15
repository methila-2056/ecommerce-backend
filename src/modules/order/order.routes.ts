import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../shared/middleware/validate.js';

import * as orderController from './order.controller.js';
import * as validators from './order.validators.js';

const router = Router();

// Admin / support order management.
router.get(
  '/admin',
  authenticate,
  authorize('ADMIN', 'SUPPORT'),
  validateQuery(validators.adminListOrdersQuerySchema),
  orderController.adminListOrders,
);
router.get(
  '/admin/:orderId',
  authenticate,
  authorize('ADMIN', 'SUPPORT'),
  validateParams(validators.orderIdParamSchema),
  orderController.adminGetOrder,
);
router.post(
  '/admin/:orderId/transition',
  authenticate,
  authorize('ADMIN', 'SUPPORT'),
  validateParams(validators.orderIdParamSchema),
  validateBody(validators.transitionSchema),
  orderController.adminTransitionOrder,
);

// Customer order flow.
router.post(
  '/',
  authenticate,
  validateBody(validators.createOrderSchema),
  orderController.createOrder,
);
router.get(
  '/',
  authenticate,
  validateQuery(validators.listOrdersQuerySchema),
  orderController.listMyOrders,
);
router.post(
  '/:orderId/cancel',
  authenticate,
  validateParams(validators.orderIdParamSchema),
  validateBody(validators.cancelOrderSchema),
  orderController.cancelOrder,
);
router.post(
  '/:orderId/refund-request',
  authenticate,
  validateParams(validators.orderIdParamSchema),
  validateBody(validators.refundRequestSchema),
  orderController.requestRefund,
);
router.get(
  '/:orderId',
  authenticate,
  validateParams(validators.orderIdParamSchema),
  orderController.getOrder,
);

export default router;
