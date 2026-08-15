import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier format');

export const checkoutSchema = z.object({
  orderId: objectIdSchema,
});

export const orderIdParamSchema = z.object({
  orderId: objectIdSchema,
});

export const refundSchema = z.object({
  amountCents: z.number().int().min(1).optional(),
  reason: z.string().max(1000).optional(),
});

export const mockNotifySchema = z.object({
  type: z.enum(['payment.succeeded', 'payment.failed', 'refund.succeeded']),
  providerReference: z.string().min(1),
  amountCents: z.number().int().min(1),
  reason: z.string().max(1000).optional(),
});
