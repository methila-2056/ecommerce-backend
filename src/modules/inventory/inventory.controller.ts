import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import { sendSuccess } from '../../shared/utils/response.js';
import * as inventoryService from './inventory.service.js';

function requireUser(req: Request): { actorId: string } {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  return { actorId: req.user.userId };
}

export async function restock(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { productId, variantId } = req.params as { productId: string; variantId: string };
  const { quantity, reason } = req.body as { quantity: number; reason?: string };
  const stock = await inventoryService.restock(
    productId,
    variantId,
    quantity,
    reason ?? '',
    actorId,
  );
  sendSuccess(res, stock, 'Stock restocked successfully');
}

export async function adjustStock(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { productId, variantId } = req.params as { productId: string; variantId: string };
  const { quantity, reason } = req.body as { quantity: number; reason: string };
  const stock = await inventoryService.adjustStock(productId, variantId, quantity, reason, actorId);
  sendSuccess(res, stock, 'Stock adjusted successfully');
}

export async function getStock(req: Request, res: Response): Promise<void> {
  const { productId, variantId } = req.params as { productId: string; variantId: string };
  const stock = await inventoryService.getStock(productId, variantId);
  sendSuccess(res, stock, 'Stock retrieved successfully');
}

export async function listMovements(req: Request, res: Response): Promise<void> {
  const result = await inventoryService.listMovements(req.query as never);
  sendSuccess(res, result.movements, 'Stock movements retrieved successfully', result.meta);
}

export async function listLowStock(_req: Request, res: Response): Promise<void> {
  const items = await inventoryService.listLowStock();
  sendSuccess(res, items, 'Low stock products retrieved successfully');
}

// The reservation/release/deduct endpoints are primarily used internally by
// the order flow (which passes a reference), but exposing them lets sellers
// test the full inventory lifecycle and lets the order module reuse the exact
// same code path through HTTP for demo purposes.
export async function reserveStock(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { productId, variantId } = req.params as { productId: string; variantId: string };
  const { quantity } = req.body as { quantity: number };
  const stock = await inventoryService.reserveStock(
    productId,
    variantId,
    quantity,
    'manual reservation',
    {
      referenceType: 'manual',
      actorId,
    },
  );
  sendSuccess(res, stock, 'Stock reserved successfully');
}

export async function releaseStock(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { productId, variantId } = req.params as { productId: string; variantId: string };
  const { quantity } = req.body as { quantity: number };
  const stock = await inventoryService.releaseStock(
    productId,
    variantId,
    quantity,
    'manual release',
    {
      referenceType: 'manual',
      actorId,
    },
  );
  sendSuccess(res, stock, 'Stock released successfully');
}

export async function deductStock(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { productId, variantId } = req.params as { productId: string; variantId: string };
  const { quantity } = req.body as { quantity: number };
  const stock = await inventoryService.deductStock(
    productId,
    variantId,
    quantity,
    'manual deduction',
    {
      referenceType: 'manual',
      actorId,
    },
  );
  sendSuccess(res, stock, 'Stock deducted successfully');
}
