import { z } from 'zod';
import { MOVEMENT_TYPES } from './inventory.model.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier format');

export const inventoryTargetParamsSchema = z.object({
  productId: objectIdSchema,
  variantId: objectIdSchema,
});

export const reserveStockSchema = z.object({
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

export const releaseStockSchema = z.object({
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

export const deductStockSchema = z.object({
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

export const restockSchema = z.object({
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  reason: z.string().trim().max(500).default('').optional(),
});

export const adjustStockSchema = z.object({
  quantity: z.number().int().min(0, 'Quantity must be a non-negative integer'),
  reason: z.string().trim().min(1, 'A reason is required for adjustments').max(500),
});

export const movementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  productId: objectIdSchema.optional(),
  variantId: objectIdSchema.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  sku: z.string().trim().max(64).optional(),
});

export type ReserveStockInput = z.infer<typeof reserveStockSchema>;
export type ReleaseStockInput = z.infer<typeof releaseStockSchema>;
export type DeductStockInput = z.infer<typeof deductStockSchema>;
export type RestockInput = z.infer<typeof restockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
