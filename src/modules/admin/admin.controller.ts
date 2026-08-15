import type { Request, Response } from 'express';
import { sendSuccess } from '../../shared/utils/response.js';
import * as adminService from './admin.service.js';

export async function dashboardSummary(_req: Request, res: Response): Promise<void> {
  const summary = await adminService.getDashboardSummary();
  sendSuccess(res, summary, 'Dashboard summary retrieved successfully');
}

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const query = req.query as {
    page?: number;
    limit?: number;
    event?: string;
    actorId?: string;
    from?: string;
    to?: string;
  };
  const result = await adminService.listAuditLogs(query);
  sendSuccess(res, result.logs, 'Audit logs retrieved successfully', result.meta);
}

export async function productPerformance(req: Request, res: Response): Promise<void> {
  const { productId } = req.params as { productId: string };
  const result = await adminService.getProductPerformance(productId);
  sendSuccess(res, result, 'Product performance retrieved successfully');
}
