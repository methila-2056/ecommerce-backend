import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import { sendSuccess } from '../../shared/utils/response.js';
import * as orderService from './order.service.js';
import type { OrderStatus } from './order.model.js';

function requireUser(req: Request): { userId: string } {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  return { userId: req.user.userId };
}

export async function createOrder(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const body = req.body as {
    shippingAddressId?: string;
    shippingAddress?: Record<string, unknown>;
    couponCode?: string;
  };
  const order = await orderService.createOrder(userId, {
    shippingAddressId: body.shippingAddressId,
    shippingAddress: body.shippingAddress as Parameters<
      typeof orderService.createOrder
    >[1]['shippingAddress'],
    couponCode: body.couponCode,
  });
  sendSuccess(res, order, 'Order created successfully', undefined, 201);
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { orderId } = req.params as { orderId: string };
  const order = await orderService.getOrderById(orderId, userId);
  sendSuccess(res, order, 'Order retrieved successfully');
}

export async function listMyOrders(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const query = req.query as { page?: number; limit?: number; status?: OrderStatus };
  const result = await orderService.listCustomerOrders(userId, query);
  sendSuccess(res, result.orders, 'Orders retrieved successfully', result.meta);
}

export async function adminListOrders(req: Request, res: Response): Promise<void> {
  const query = req.query as {
    page?: number;
    limit?: number;
    status?: OrderStatus;
    userId?: string;
    orderNumber?: string;
    from?: string;
    to?: string;
  };
  const result = await orderService.listAdminOrders(query);
  sendSuccess(res, result.orders, 'Orders retrieved successfully', result.meta);
}

export async function adminGetOrder(req: Request, res: Response): Promise<void> {
  const { orderId } = req.params as { orderId: string };
  const order = await orderService.getOrderById(orderId);
  sendSuccess(res, order, 'Order retrieved successfully');
}

export async function adminTransitionOrder(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { orderId } = req.params as { orderId: string };
  const body = req.body as { to: OrderStatus; note?: string };
  const order = await orderService.adminTransitionOrder(
    orderId,
    { to: body.to, note: body.note },
    userId,
  );
  sendSuccess(res, order, 'Order status updated successfully');
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { orderId } = req.params as { orderId: string };
  const body = req.body as { reason?: string };
  const order = await orderService.cancelOrderByCustomer(orderId, userId, body.reason);
  sendSuccess(res, order, 'Order cancelled successfully');
}

export async function requestRefund(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { orderId } = req.params as { orderId: string };
  const body = req.body as { reason: string };
  const order = await orderService.requestRefund(orderId, userId, body.reason);
  sendSuccess(res, order, 'Refund requested successfully');
}
