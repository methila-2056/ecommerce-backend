import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../shared/middleware/validate.js';
import * as catalogController from './catalog.controller.js';
import * as validators from './catalog.validators.js';

const router = Router();

// Public storefront catalog (no authentication).
router.get(
  '/products',
  validateQuery(validators.productListQuerySchema),
  catalogController.searchProducts,
);
router.get('/products/slug/:slug', catalogController.getProductBySlug);
router.get('/products/:id', validateParams(validators.idParamSchema), catalogController.getProduct);

// Public category/brand reference lists.
router.get('/categories', catalogController.listCategories);
router.get('/brands', catalogController.listBrands);

// Protected catalog management. SELLER and ADMIN both operate the catalog;
// `createdBy` records the actor for auditability.
const manageProducts = [authorize('SELLER', 'ADMIN')] as const;

router.get(
  '/admin/products',
  authenticate,
  ...manageProducts,
  validateQuery(validators.productListQuerySchema),
  catalogController.adminSearchProducts,
);
router.get(
  '/admin/products/:id',
  authenticate,
  ...manageProducts,
  validateParams(validators.idParamSchema),
  catalogController.adminGetProduct,
);
router.post(
  '/admin/products',
  authenticate,
  ...manageProducts,
  validateBody(validators.productInputSchema),
  catalogController.createProduct,
);
router.patch(
  '/admin/products/:id',
  authenticate,
  ...manageProducts,
  validateParams(validators.idParamSchema),
  validateBody(validators.productUpdateSchema),
  catalogController.updateProduct,
);
router.patch(
  '/admin/products/:id/status',
  authenticate,
  ...manageProducts,
  validateParams(validators.idParamSchema),
  validateBody(validators.productStatusSchema),
  catalogController.setProductStatus,
);
router.delete(
  '/admin/products/:id',
  authenticate,
  ...manageProducts,
  validateParams(validators.idParamSchema),
  catalogController.archiveProduct,
);

router.post(
  '/admin/categories',
  authenticate,
  authorize('ADMIN'),
  validateBody(validators.categoryInputSchema),
  catalogController.createCategory,
);
router.patch(
  '/admin/categories/:id',
  authenticate,
  authorize('ADMIN'),
  validateParams(validators.idParamSchema),
  validateBody(validators.categoryUpdateSchema),
  catalogController.updateCategory,
);
router.delete(
  '/admin/categories/:id',
  authenticate,
  authorize('ADMIN'),
  validateParams(validators.idParamSchema),
  catalogController.deleteCategory,
);

router.post(
  '/admin/brands',
  authenticate,
  authorize('ADMIN'),
  validateBody(validators.brandInputSchema),
  catalogController.createBrand,
);
router.patch(
  '/admin/brands/:id',
  authenticate,
  authorize('ADMIN'),
  validateParams(validators.idParamSchema),
  validateBody(validators.brandUpdateSchema),
  catalogController.updateBrand,
);
router.delete(
  '/admin/brands/:id',
  authenticate,
  authorize('ADMIN'),
  validateParams(validators.idParamSchema),
  catalogController.deleteBrand,
);

export default router;
