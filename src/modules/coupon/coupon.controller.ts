import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import { sendSuccess } from '../../shared/utils/response.js';
import * as couponService from './coupon.service.js';

export async function createCoupon(req: Request, res: Response): Promise<void> {
  const actorId = req.user?.userId;
  if (!actorId) throw AppError.unauthorized('Authentication required');
  const coupon = await couponService.createCoupon(
    req.body as Parameters<typeof couponService.createCoupon>[0],
    actorId,
  );
  sendSuccess(res, coupon, 'Coupon created successfully', undefined, 201);
}

export async function updateCoupon(req: Request, res: Response): Promise<void> {
  const actorId = req.user?.userId;
  if (!actorId) throw AppError.unauthorized('Authentication required');
  const { couponId } = req.params as { couponId: string };
  const coupon = await couponService.updateCoupon(
    couponId,
    req.body as Parameters<typeof couponService.updateCoupon>[1],
    actorId,
  );
  sendSuccess(res, coupon, 'Coupon updated successfully');
}

export async function deleteCoupon(req: Request, res: Response): Promise<void> {
  const actorId = req.user?.userId;
  if (!actorId) throw AppError.unauthorized('Authentication required');
  const { couponId } = req.params as { couponId: string };
  await couponService.deleteCoupon(couponId, actorId);
  sendSuccess(res, null, 'Coupon deleted successfully');
}

export async function listCoupons(req: Request, res: Response): Promise<void> {
  const query = req.query as { page?: number; limit?: number; isActive?: 'true' | 'false' };
  const result = await couponService.listCoupons(query);
  sendSuccess(res, result.coupons, 'Coupons retrieved successfully', result.meta);
}

export async function validateCoupon(req: Request, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) throw AppError.unauthorized('Authentication required');
  const { code } = req.params as { code: string };
  const items = (req.body?.items ?? []) as Parameters<typeof couponService.computeDiscount>[2];
  const result = await couponService.computeDiscount(code, userId, items);
  sendSuccess(res, result, 'Coupon is valid');
}
