import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../shared/middleware/validate.js';
import * as inventoryController from './inventory.controller.js';
import * as validators from './inventory.validators.js';

const router = Router();

// SELLER and ADMIN manage stock; the operations map 1:1 to the internal
// inventory service used by the order pipeline.
const canManageInventory = [authorize('SELLER', 'ADMIN')] as const;

router.get(
  '/movements',
  authenticate,
  ...canManageInventory,
  validateQuery(validators.movementsQuerySchema),
  inventoryController.listMovements,
);
router.get(
  '/low-stock',
  authenticate,
  authorize('SELLER', 'ADMIN'),
  inventoryController.listLowStock,
);

router.get(
  '/:productId/variants/:variantId',
  authenticate,
  ...canManageInventory,
  validateParams(validators.inventoryTargetParamsSchema),
  inventoryController.getStock,
);
router.post(
  '/:productId/variants/:variantId/restock',
  authenticate,
  ...canManageInventory,
  validateParams(validators.inventoryTargetParamsSchema),
  validateBody(validators.restockSchema),
  inventoryController.restock,
);
router.post(
  '/:productId/variants/:variantId/adjust',
  authenticate,
  ...canManageInventory,
  validateParams(validators.inventoryTargetParamsSchema),
  validateBody(validators.adjustStockSchema),
  inventoryController.adjustStock,
);
router.post(
  '/:productId/variants/:variantId/reserve',
  authenticate,
  ...canManageInventory,
  validateParams(validators.inventoryTargetParamsSchema),
  validateBody(validators.reserveStockSchema),
  inventoryController.reserveStock,
);
router.post(
  '/:productId/variants/:variantId/release',
  authenticate,
  ...canManageInventory,
  validateParams(validators.inventoryTargetParamsSchema),
  validateBody(validators.releaseStockSchema),
  inventoryController.releaseStock,
);
router.post(
  '/:productId/variants/:variantId/deduct',
  authenticate,
  ...canManageInventory,
  validateParams(validators.inventoryTargetParamsSchema),
  validateBody(validators.deductStockSchema),
  inventoryController.deductStock,
);

export default router;
