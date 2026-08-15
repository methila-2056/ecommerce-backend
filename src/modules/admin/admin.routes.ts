import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validateParams, validateQuery } from '../../shared/middleware/validate.js';
import { z } from 'zod';
import * as adminController from './admin.controller.js';

const router = Router();

const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  event: z.string().trim().min(1).optional(),
  actorId: z.string().trim().min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const productIdParamSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier format'),
});

// Staff dashboard — analytics and audit trails are read-only, admin only.
router.get(
  '/dashboard/summary',
  authenticate,
  authorize('ADMIN', 'SUPPORT'),
  adminController.dashboardSummary,
);
router.get(
  '/audit-logs',
  authenticate,
  authorize('ADMIN'),
  validateQuery(auditLogsQuerySchema),
  adminController.listAuditLogs,
);
router.get(
  '/products/:productId/performance',
  authenticate,
  authorize('ADMIN', 'SUPPORT'),
  validateParams(productIdParamSchema),
  adminController.productPerformance,
);

export default router;
