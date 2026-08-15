import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { validateParams } from '../../shared/middleware/validate.js';
import * as wishlistController from './wishlist.controller.js';
import * as validators from './wishlist.validators.js';

const router = Router();

// A wishlist belongs to exactly one user; every route is authenticated and
// scoped to the caller via the token, not via a userId parameter.
router.get('/', authenticate, wishlistController.getWishlist);
router.post(
  '/:productId',
  authenticate,
  validateParams(validators.wishlistParamsSchema),
  wishlistController.addToWishlist,
);
router.delete(
  '/:productId',
  authenticate,
  validateParams(validators.wishlistParamsSchema),
  wishlistController.removeFromWishlist,
);
router.delete('/', authenticate, wishlistController.clearWishlist);

export default router;
