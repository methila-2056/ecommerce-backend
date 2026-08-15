import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { validateBody, validateParams } from '../../shared/middleware/validate.js';
import * as cartController from './cart.controller.js';
import * as validators from './cart.validators.js';

const router = Router();

// Cart endpoints require authentication (a cart belongs to a user).
router.get('/', authenticate, cartController.getCart);
router.post('/', authenticate, validateBody(validators.addItemSchema), cartController.addItem);
router.patch(
  '/items/:variantId',
  authenticate,
  validateParams(validators.variantParamSchema),
  validateBody(validators.updateQuantitySchema),
  cartController.updateQuantity,
);
router.delete(
  '/items/:variantId',
  authenticate,
  validateParams(validators.variantParamSchema),
  cartController.removeItem,
);
router.delete('/', authenticate, cartController.clearCart);

export default router;
