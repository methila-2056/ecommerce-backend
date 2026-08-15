import { z } from 'zod';
import { PRODUCT_STATUSES } from './product.model.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier format');
const imageUrlSchema = z
  .string()
  .trim()
  .max(1000, 'Image URL too long')
  .regex(/^https?:\/\//i, 'Image must be an absolute http(s) URL');

export const idParamSchema = z.object({ id: objectIdSchema });

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  parent: objectIdSchema.nullable().optional(),
  description: z.string().trim().max(1000).default('').optional(),
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export const categoryUpdateSchema = categoryInputSchema.partial();

export const brandInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(1000).default('').optional(),
  isActive: z.boolean().optional(),
});

export const brandUpdateSchema = brandInputSchema.partial();

export const productStatusSchema = z.object({ status: z.enum(PRODUCT_STATUSES) });

const variantInputSchema = z.object({
  // Present only when syncing an existing variant during product update;
  // omitted for brand-new variants.
  id: objectIdSchema.optional(),
  sku: z.string().trim().min(1, 'SKU is required').max(64),
  attributes: z.record(z.string().min(1).max(100), z.string().min(1).max(100)).optional(),
  priceCents: z.number().int().min(0, 'Price must be a non-negative integer (cents)'),
  compareAtPriceCents: z.number().int().min(0).nullable().optional(),
  taxRate: z.number().min(0).max(100).default(0).optional(),
  quantity: z.number().int().min(0).default(0).optional(),
  lowStockThreshold: z.number().int().min(0).default(5).optional(),
  images: z.array(imageUrlSchema).max(10).optional(),
  isActive: z.boolean().optional(),
});

export const productInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  summary: z.string().trim().max(500).optional(),
  description: z.string().trim().max(50_000).optional(),
  brand: objectIdSchema.nullable().optional(),
  category: objectIdSchema.nullable().optional(),
  images: z.array(imageUrlSchema).max(10).optional(),
  specs: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(100),
        value: z.string().trim().min(1).max(500),
      }),
    )
    .max(50)
    .optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  isActive: z.boolean().optional(),
  variants: z.array(variantInputSchema).min(1, 'At least one variant is required').max(100),
});

export const productUpdateSchema = productInputSchema.partial().extend({
  // Full replacement of the variant array (admin sends the complete set).
  variants: z.array(variantInputSchema).min(1).max(100).optional(),
});

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  keyword: z.string().trim().max(200).optional(),
  category: objectIdSchema.optional(),
  brand: objectIdSchema.optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  rating: z.coerce.number().min(1).max(5).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  sort: z
    .enum(['newest', 'oldest', 'price_asc', 'price_desc', 'rating', 'relevance'])
    .default('newest'),
  includeInactive: z.enum(['true', 'false']).optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type BrandInput = z.infer<typeof brandInputSchema>;
export type BrandUpdate = z.infer<typeof brandUpdateSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
