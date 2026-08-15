import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../shared/middleware/validate.js';
import * as userController from './user.controller.js';
import * as validators from './user.validators.js';

const router = Router();

// Self-service profile & address management (any authenticated user).
router.get('/me', authenticate, userController.getProfile);
router.patch(
  '/me',
  authenticate,
  validateBody(validators.updateProfileSchema),
  userController.updateProfile,
);
router.get('/me/addresses', authenticate, userController.listAddresses);
router.post(
  '/me/addresses',
  authenticate,
  validateBody(validators.addressSchema),
  userController.addAddress,
);
router.patch(
  '/me/addresses/:id',
  authenticate,
  validateParams(validators.addressParamSchema),
  validateBody(validators.updateAddressSchema),
  userController.updateAddress,
);
router.delete(
  '/me/addresses/:id',
  authenticate,
  validateParams(validators.addressParamSchema),
  userController.removeAddress,
);
router.post(
  '/me/addresses/:id/default',
  authenticate,
  validateParams(validators.addressParamSchema),
  userController.setDefaultAddress,
);
router.post(
  '/me/deactivate',
  authenticate,
  validateBody(validators.deactivateAccountSchema),
  userController.deactivateAccount,
);

// Admin user management (ADMIN role only).
router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  validateQuery(validators.userListQuerySchema),
  userController.adminListUsers,
);
router.get(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  validateParams(validators.userParamSchema),
  userController.adminGetUser,
);
router.patch(
  '/:id/status',
  authenticate,
  authorize('ADMIN'),
  validateParams(validators.userParamSchema),
  validateBody(validators.updateUserStatusSchema),
  userController.adminUpdateUserStatus,
);
router.patch(
  '/:id/roles',
  authenticate,
  authorize('ADMIN'),
  validateParams(validators.userParamSchema),
  validateBody(validators.updateUserRolesSchema),
  userController.adminUpdateUserRoles,
);

export default router;
