import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier format');

export const createCouponSchema = z.object({
  code: z.string().trim().min(1).max(50),
  type: z.enum(['percentage', 'fixed']),
  value: z.number().int().min(1, 'Discount value must be at least 1'),
  scope: z.enum(['all', 'category', 'product']).optional(),
  productIds: z.array(objectIdSchema).optional(),
  categoryIds: z.array(objectIdSchema).optional(),
  minOrderValueCents: z.number().int().min(0).optional(),
  maxDiscountCents: z.number().int().min(0).nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).optional(),
  validFrom: z.string().datetime({ offset: true }).optional(),
  validUntil: z.string().datetime({ offset: true }).optional(),
  isActive: z.boolean().optional(),
});

export const updateCouponSchema = createCouponSchema.partial();

export const couponIdParamSchema = z.object({
  couponId: objectIdSchema,
});

export const couponCodeParamSchema = z.object({
  code: z.string().trim().min(1).max(50),
});

export const listCouponsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z.enum(['true', 'false']).optional(),
});

export const validateCouponSchema = z.object({
  items: z.array(
    z.object({
      productId: objectIdSchema,
      category: objectIdSchema.nullable().optional(),
      unitPriceCents: z.number().int().min(0),
      quantity: z.number().int().min(1),
    }),
  ),
});
