import { z } from 'zod';
import { ORDER_STATUSES } from './order.model.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier format');

export const shippingAddressSchema = z.object({
  fullName: z.string().min(1).max(100),
  phone: z.string().min(1).max(30),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().length(2, 'Country must be an ISO 3166-1 alpha-2 code'),
});

export const createOrderSchema = z
  .object({
    shippingAddressId: objectIdSchema.optional(),
    shippingAddress: shippingAddressSchema.optional(),
    couponCode: z.string().trim().min(1).max(50).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.shippingAddressId && !val.shippingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shippingAddress'],
        message: 'Either shippingAddressId or shippingAddress is required',
      });
    }
  });

export const orderIdParamSchema = z.object({
  orderId: objectIdSchema,
});

export const transitionSchema = z.object({
  to: z.enum(ORDER_STATUSES),
  note: z.string().max(500).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const refundRequestSchema = z.object({
  reason: z.string().min(1, 'A reason is required').max(1000),
});

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ORDER_STATUSES).optional(),
});

export const adminListOrdersQuerySchema = listOrdersQuerySchema.extend({
  userId: objectIdSchema.optional(),
  orderNumber: z.string().trim().min(1).max(50).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type TransitionInput = z.infer<typeof transitionSchema>;
