import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import { sendSuccess } from '../../shared/utils/response.js';
import * as wishlistService from './wishlist.service.js';

function requireUser(req: Request): { userId: string } {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  return { userId: req.user.userId };
}

export async function getWishlist(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const items = await wishlistService.getWishlist(userId);
  sendSuccess(res, items, 'Wishlist retrieved successfully');
}

export async function addToWishlist(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { productId } = req.params as { productId: string };
  const items = await wishlistService.addToWishlist(userId, productId);
  sendSuccess(res, items, 'Item added to wishlist successfully');
}

export async function removeFromWishlist(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { productId } = req.params as { productId: string };
  const items = await wishlistService.removeFromWishlist(userId, productId);
  sendSuccess(res, items, 'Item removed from wishlist');
}

export async function clearWishlist(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const items = await wishlistService.clearWishlist(userId);
  sendSuccess(res, items, 'Wishlist cleared');
}
