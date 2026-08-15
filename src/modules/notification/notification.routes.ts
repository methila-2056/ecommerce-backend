import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { validateParams, validateQuery } from '../../shared/middleware/validate.js';
import { z } from 'zod';
import * as notificationController from './notification.controller.js';

const router = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.enum(['true', 'false']).optional(),
});

const idParamSchema = z.object({
  notificationId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier format'),
});

// Notifications are personal; every endpoint is scoped to the authenticated
// user and requires no role beyond CUSTOMER.
router.get(
  '/',
  authenticate,
  validateQuery(listQuerySchema),
  notificationController.listNotifications,
);
router.get('/unread-count', authenticate, notificationController.unreadCount);
router.post('/read-all', authenticate, notificationController.markAllRead);
router.post(
  '/:notificationId/read',
  authenticate,
  validateParams(idParamSchema),
  notificationController.markRead,
);

export default router;
