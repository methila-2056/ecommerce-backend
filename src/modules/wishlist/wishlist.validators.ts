import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier format');

export const productIdParamSchema = z.object({
  productId: objectIdSchema,
});

export const wishlistParamsSchema = z.object({
  productId: objectIdSchema,
});
