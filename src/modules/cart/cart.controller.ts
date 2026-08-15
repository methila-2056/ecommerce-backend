import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import { sendSuccess } from '../../shared/utils/response.js';
import * as cartService from './cart.service.js';

function requireUser(req: Request): { userId: string } {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  return { userId: req.user.userId };
}

export async function getCart(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const cart = await cartService.getCart(userId);
  sendSuccess(res, cart, 'Cart retrieved successfully');
}

export async function addItem(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { productId, variantId, quantity } = req.body as {
    productId: string;
    variantId: string;
    quantity: number;
  };
  const cart = await cartService.addItem(userId, productId, variantId, quantity);
  sendSuccess(res, cart, 'Item added to cart successfully');
}

export async function updateQuantity(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { variantId } = req.params as { variantId: string };
  const { quantity } = req.body as { quantity: number };
  const cart = await cartService.updateItemQuantity(userId, variantId, quantity);
  sendSuccess(res, cart, 'Cart updated successfully');
}

export async function removeItem(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { variantId } = req.params as { variantId: string };
  const cart = await cartService.removeItem(userId, variantId);
  sendSuccess(res, cart, 'Item removed from cart');
}

export async function clearCart(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const cart = await cartService.clearCart(userId);
  sendSuccess(res, cart, 'Cart cleared');
}
