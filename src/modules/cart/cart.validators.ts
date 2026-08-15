import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier format');

export const addItemSchema = z.object({
  productId: objectIdSchema,
  variantId: objectIdSchema,
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(99),
});

export const updateQuantitySchema = z.object({
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(99),
});

export const variantParamSchema = z.object({
  variantId: objectIdSchema,
});

export type AddItemInput = z.infer<typeof addItemSchema>;
export type UpdateQuantityInput = z.infer<typeof updateQuantitySchema>;
