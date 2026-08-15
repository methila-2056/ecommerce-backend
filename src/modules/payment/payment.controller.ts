import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import { sendSuccess } from '../../shared/utils/response.js';
import * as paymentService from './payment.service.js';

function requireUser(req: Request): { userId: string; roles: string[] } {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  return { userId: req.user.userId, roles: req.user.roles };
}

export async function createCheckout(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { orderId } = req.body as { orderId: string };
  const result = await paymentService.createCheckout(orderId, userId);
  sendSuccess(res, result, 'Checkout created successfully', undefined, 201);
}

export async function getPayment(req: Request, res: Response): Promise<void> {
  const { userId, roles } = requireUser(req);
  const { orderId } = req.params as { orderId: string };
  const isStaff = roles.includes('ADMIN') || roles.includes('SUPPORT');
  const payment = await paymentService.getPaymentByOrder(orderId, isStaff ? undefined : userId);
  sendSuccess(res, payment, 'Payment retrieved successfully');
}

export async function refundOrder(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { orderId } = req.params as { orderId: string };
  const body = req.body as { amountCents?: number; reason?: string };
  const payment = await paymentService.refundOrder(orderId, body, userId);
  sendSuccess(res, payment, 'Refund processed successfully');
}

// Dev-only: lets developers simulate a gateway webhook without a real gateway.
// Disabled in production (the mock provider itself is never used there).
export async function mockNotify(req: Request, res: Response): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw AppError.forbidden('Mock webhook endpoint is disabled in production');
  }
  const body = req.body as {
    type: string;
    providerReference: string;
    amountCents: number;
    reason?: string;
  };
  const { getPaymentProvider } = await import('./payment.provider.js');
  const provider = getPaymentProvider('mock') as unknown as {
    buildSignedWebhook(input: {
      type: string;
      providerReference: string;
      amountCents: number;
      reason?: string;
    }): {
      body: Buffer;
      signature: string;
    };
  };
  const { body: raw, signature } = provider.buildSignedWebhook({
    type: body.type,
    providerReference: body.providerReference,
    amountCents: body.amountCents,
    reason: body.reason,
  });
  const result = await paymentService.processWebhook('mock', raw, signature);
  sendSuccess(res, result, 'Mock webhook delivered');
}
