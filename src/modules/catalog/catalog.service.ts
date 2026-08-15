import { Types, type PipelineStage } from 'mongoose';
import { AppError } from '../../shared/errors/AppError.js';
import { recordAudit } from '../../shared/utils/audit.js';
import {
  buildPaginationMeta,
  toPageOptions,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import { slugify } from '../../shared/utils/slugify.js';
import { Brand } from './brand.model.js';
import { Category, type ICategory } from './category.model.js';
import {
  Product,
  type IProduct,
  type IVariant,
  type ProductDocument,
  type ProductStatus,
} from './product.model.js';

// ---------------------------------------------------------------------------
// Public shapes (money is integer cents; internal fields never leak)
// ---------------------------------------------------------------------------

export interface VariantPublic {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  priceCents: number;
  compareAtPriceCents: number | null;
  taxRate: number;
  images: string[];
  isActive: boolean;
  stock?: { quantity: number; reserved: number; available: number; lowStockThreshold: number };
  inStock?: boolean;
}

export interface ProductPublic {
  id: string;
  name: string;
  slug: string;
  summary: string;
  description: string;
  brand: string | null;
  category: string | null;
  images: string[];
  specs: { key: string; value: string }[];
  tags: string[];
  status: ProductStatus;
  isActive: boolean;
  publishedAt: string | null;
  variants: VariantPublic[];
  minPriceCents: number | null;
  inStock: boolean;
  averageRating: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ProductListItem extends Record<string, unknown> {
  _id: unknown;
  activePrices?: { priceCents: number }[];
  hasActiveVariant?: boolean;
  minPriceCents?: number | null;
  score?: unknown;
}

function variantToPublic(
  variant: IVariant & { _id?: unknown },
  includeStock: boolean,
): VariantPublic {
  const base = {
    id: (variant._id as { toString(): string }).toString(),
    sku: variant.sku,
    attributes: variant.attributes,
    priceCents: variant.priceCents,
    compareAtPriceCents: variant.compareAtPriceCents,
    taxRate: variant.taxRate,
    images: variant.images,
    isActive: variant.isActive,
  };
  if (includeStock) {
    return {
      ...base,
      stock: {
        quantity: variant.stock.quantity,
        reserved: variant.stock.reserved,
        available: variant.stock.available,
        lowStockThreshold: variant.stock.lowStockThreshold,
      },
    };
  }
  return { ...base, inStock: variant.stock.available > 0 };
}

export function toProductPublic(
  product: ProductDocument,
  opts?: { includeStock?: boolean },
): ProductPublic {
  const includeStock = opts?.includeStock ?? true;
  const activeVariants = product.variants.filter((v) => v.isActive);
  const minPriceCents =
    activeVariants.length > 0 ? Math.min(...activeVariants.map((v) => v.priceCents)) : null;
  return {
    id: product._id.toString(),
    name: product.name,
    slug: product.slug,
    summary: product.summary,
    description: product.description,
    brand: product.brand?.toString() ?? null,
    category: product.category?.toString() ?? null,
    images: product.images,
    specs: product.specs,
    tags: product.tags,
    status: product.status,
    isActive: product.isActive,
    publishedAt: product.publishedAt?.toISOString() ?? null,
    variants: product.variants.map((v) => variantToPublic(v, includeStock)),
    minPriceCents,
    inStock: product.variants.some((v) => v.isActive && v.stock.available > 0),
    averageRating: product.averageRating,
    ratingCount: product.ratingCount,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function rawToProductPublic(raw: ProductListItem, includeStock: boolean): ProductPublic {
  const variants = (raw.variants as (IVariant & { _id?: unknown })[]) ?? [];
  const activeVariants = variants.filter((v) => v.isActive);
  const minPriceCents =
    raw.minPriceCents ??
    (activeVariants.length > 0 ? Math.min(...activeVariants.map((v) => v.priceCents)) : null);
  return {
    id: (raw._id as { toString(): string }).toString(),
    name: raw.name as string,
    slug: raw.slug as string,
    summary: (raw.summary as string) ?? '',
    description: (raw.description as string) ?? '',
    brand: (raw.brand as string | null)?.toString() ?? null,
    category: (raw.category as string | null)?.toString() ?? null,
    images: (raw.images as string[]) ?? [],
    specs: (raw.specs as { key: string; value: string }[]) ?? [],
    tags: (raw.tags as string[]) ?? [],
    status: raw.status as ProductStatus,
    isActive: (raw.isActive as boolean) ?? true,
    publishedAt:
      raw.publishedAt instanceof Date
        ? raw.publishedAt.toISOString()
        : ((raw.publishedAt as string | null) ?? null),
    variants: variants.map((v) => variantToPublic(v, includeStock)),
    minPriceCents,
    inStock:
      (raw.hasActiveVariant as boolean | undefined) ??
      variants.some((v) => v.isActive && v.stock.available > 0),
    averageRating: (raw.averageRating as number) ?? 0,
    ratingCount: (raw.ratingCount as number) ?? 0,
    createdAt:
      raw.createdAt instanceof Date ? raw.createdAt.toISOString() : (raw.createdAt as string),
    updatedAt:
      raw.updatedAt instanceof Date ? raw.updatedAt.toISOString() : (raw.updatedAt as string),
  };
}

// ---------------------------------------------------------------------------
// Catalog search (storefront) and management (admin)
// ---------------------------------------------------------------------------

export interface ProductSearchOptions {
  adminView?: boolean;
}

export interface ProductSearchResult {
  products: ProductPublic[];
  meta: PaginationMeta;
}

export async function searchProducts(
  query: {
    page?: number;
    limit?: number;
    keyword?: string;
    category?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    rating?: number;
    inStock?: 'true' | 'false';
    status?: ProductStatus;
    sort?: 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'rating' | 'relevance';
  },
  opts: ProductSearchOptions = {},
): Promise<ProductSearchResult> {
  const options = toPageOptions(query);
  const includeStock = opts.adminView ?? false;

  const pipeline: PipelineStage[] = [];

  const visibility: Record<string, unknown> = opts.adminView
    ? {}
    : { status: 'published', isActive: true };
  const firstMatch: Record<string, unknown> = { ...visibility };
  if (query.keyword) firstMatch.$text = { $search: query.keyword };
  pipeline.push({ $match: firstMatch } as PipelineStage);

  if (query.category) {
    pipeline.push({ $match: { category: toObjectId(query.category) } });
  }
  if (query.brand) {
    pipeline.push({ $match: { brand: toObjectId(query.brand) } });
  }
  if (query.status && opts.adminView) {
    pipeline.push({ $match: { status: query.status } });
  }

  // Derived fields used for price filtering/sorting and availability.
  pipeline.push({
    $addFields: {
      activePrices: {
        $filter: { input: '$variants', as: 'v', cond: { $eq: ['$$v.isActive', true] } },
      },
      hasActiveVariant: {
        $gt: [
          {
            $size: {
              $filter: {
                input: '$variants',
                as: 'v',
                cond: {
                  $and: [{ $eq: ['$$v.isActive', true] }, { $gt: ['$$v.stock.available', 0] }],
                },
              },
            },
          },
          0,
        ],
      },
    },
  } as PipelineStage);
  pipeline.push({ $addFields: { minPriceCents: { $min: '$activePrices.priceCents' } } });

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const priceFilter: Record<string, unknown> = {};
    if (query.minPrice !== undefined) priceFilter.$gte = query.minPrice;
    if (query.maxPrice !== undefined) priceFilter.$lte = query.maxPrice;
    pipeline.push({ $match: { minPriceCents: priceFilter } });
  }
  if (query.rating !== undefined) {
    pipeline.push({ $match: { averageRating: { $gte: query.rating } } });
  }
  if (query.inStock === 'true') {
    pipeline.push({ $match: { hasActiveVariant: true } });
  }

  const sortStage: Record<string, 1 | -1 | { $meta: 'textScore' }> = {};
  switch (query.sort) {
    case 'price_asc':
      sortStage.minPriceCents = 1;
      break;
    case 'price_desc':
      sortStage.minPriceCents = -1;
      break;
    case 'rating':
      sortStage.averageRating = -1;
      sortStage.ratingCount = -1;
      break;
    case 'relevance':
      if (query.keyword) sortStage.score = { $meta: 'textScore' };
      else sortStage.createdAt = -1;
      break;
    case 'oldest':
      sortStage.createdAt = 1;
      break;
    default:
      sortStage.createdAt = -1;
  }
  pipeline.push({ $sort: sortStage } as PipelineStage);

  const [countResult] = await Product.aggregate<{ total: number }>([
    ...pipeline,
    { $count: 'total' },
  ] as PipelineStage[]);
  const total = countResult?.total ?? 0;

  const results = await Product.aggregate<ProductListItem>([
    ...pipeline,
    { $skip: options.skip },
    { $limit: options.limit },
  ] as PipelineStage[]);

  return {
    products: results.map((doc) => rawToProductPublic(doc, includeStock)),
    meta: buildPaginationMeta(total, options),
  };
}

export async function getProductById(
  productId: string,
  opts?: { includeStock?: boolean; allowInactive?: boolean },
): Promise<ProductPublic> {
  const product = await Product.findById(productId);
  if (!product) throw AppError.notFound('Product not found');
  if (!opts?.allowInactive && !(product.status === 'published' && product.isActive)) {
    throw AppError.notFound('Product not found');
  }
  return toProductPublic(product, { includeStock: opts?.includeStock ?? true });
}

export async function getProductBySlug(slug: string): Promise<ProductPublic> {
  const product = await Product.findOne({ slug, status: 'published', isActive: true });
  if (!product) throw AppError.notFound('Product not found');
  return toProductPublic(product, { includeStock: false });
}

// ---------------------------------------------------------------------------
// Admin product CRUD
// ---------------------------------------------------------------------------

function buildStock(quantity: number, lowStockThreshold: number) {
  return { quantity, reserved: 0, available: quantity, lowStockThreshold };
}

function normalizeVariantInput(
  input: {
    id?: string;
    sku: string;
    attributes?: Record<string, string>;
    priceCents: number;
    compareAtPriceCents?: number | null;
    taxRate?: number;
    quantity?: number;
    lowStockThreshold?: number;
    images?: string[];
    isActive?: boolean;
  },
  forCreate: boolean,
): {
  variant: Omit<IVariant, 'stock'> & { stock?: IVariant['stock'] };
  quantity?: number;
  lowStockThreshold?: number;
} {
  return {
    variant: {
      sku: input.sku,
      attributes: input.attributes ?? {},
      priceCents: input.priceCents,
      compareAtPriceCents: input.compareAtPriceCents ?? null,
      taxRate: input.taxRate ?? 0,
      images: input.images ?? [],
      isActive: input.isActive ?? true,
      ...(forCreate
        ? { stock: buildStock(input.quantity ?? 0, input.lowStockThreshold ?? 5) }
        : {}),
    },
    quantity: input.quantity,
    lowStockThreshold: input.lowStockThreshold,
  };
}

export async function createProduct(
  input: {
    name: string;
    summary?: string;
    description?: string;
    brand?: string | null;
    category?: string | null;
    images?: string[];
    specs?: { key: string; value: string }[];
    tags?: string[];
    status?: ProductStatus;
    isActive?: boolean;
    variants: {
      sku: string;
      attributes?: Record<string, string>;
      priceCents: number;
      compareAtPriceCents?: number | null;
      taxRate?: number;
      quantity?: number;
      lowStockThreshold?: number;
      images?: string[];
      isActive?: boolean;
    }[];
  },
  actorId: string,
): Promise<ProductPublic> {
  if (input.brand) await ensureBrandExists(input.brand);
  if (input.category) await ensureCategoryExists(input.category);

  const product = await Product.create({
    name: input.name,
    slug: await uniqueSlug(input.name),
    summary: input.summary ?? '',
    description: input.description ?? '',
    brand: (input.brand ?? null) as unknown as IProduct['brand'],
    category: (input.category ?? null) as unknown as IProduct['category'],
    createdBy: actorId as unknown as IProduct['createdBy'],
    images: input.images ?? [],
    specs: input.specs ?? [],
    tags: input.tags ?? [],
    status: input.status ?? 'draft',
    isActive: input.isActive ?? true,
    publishedAt: input.status === 'published' ? new Date() : null,
    variants: input.variants.map((v) => normalizeVariantInput(v, true).variant),
  });

  recordAudit(
    'product.created',
    { productId: product._id.toString(), skus: product.variants.map((v) => v.sku) },
    { actorId },
  );
  return toProductPublic(product);
}

function variantId(variant: IVariant): string {
  return (variant as unknown as { _id: { toString(): string } })._id.toString();
}

export async function updateProduct(
  productId: string,
  input: {
    name?: string;
    summary?: string;
    description?: string;
    brand?: string | null;
    category?: string | null;
    images?: string[];
    specs?: { key: string; value: string }[];
    tags?: string[];
    status?: ProductStatus;
    isActive?: boolean;
    variants?: {
      id?: string;
      sku: string;
      attributes?: Record<string, string>;
      priceCents: number;
      compareAtPriceCents?: number | null;
      taxRate?: number;
      quantity?: number;
      lowStockThreshold?: number;
      images?: string[];
      isActive?: boolean;
    }[];
  },
  actorId: string,
): Promise<ProductPublic> {
  const product = await Product.findById(productId);
  if (!product) throw AppError.notFound('Product not found');

  if (input.brand !== undefined) {
    if (input.brand) await ensureBrandExists(input.brand);
    product.brand = input.brand as unknown as IProduct['brand'];
  }
  if (input.category !== undefined) {
    if (input.category) await ensureCategoryExists(input.category);
    product.category = input.category as unknown as IProduct['category'];
  }
  if (input.name !== undefined) product.name = input.name;
  if (input.summary !== undefined) product.summary = input.summary;
  if (input.description !== undefined) product.description = input.description;
  if (input.images !== undefined) product.images = input.images;
  if (input.specs !== undefined) product.specs = input.specs;
  if (input.tags !== undefined) product.tags = input.tags;
  if (input.isActive !== undefined) product.isActive = input.isActive;
  if (input.status !== undefined) {
    if (product.status === 'archived') {
      throw AppError.badRequest('Archived products cannot be edited', {
        errorCode: 'PRODUCT_ARCHIVED',
      });
    }
    product.status = input.status;
    if (input.status === 'published' && !product.publishedAt) product.publishedAt = new Date();
  }

  // Variant sync: entries with an id update existing variants in place
  // (preserving their stock counters and _ids so inventory movement history
  // stays consistent); entries without an id are appended; existing variants
  // absent from the input are removed.
  if (input.variants) {
    if (product.status === 'published') {
      throw AppError.badRequest(
        'Unpublish the product before changing variants so price/stock changes are deliberate',
        { errorCode: 'VARIANTS_LOCKED_WHILE_PUBLISHED' },
      );
    }
    const incoming = input.variants;
    const incomingIds = new Set(
      incoming.map((v) => v.id).filter((id): id is string => Boolean(id)),
    );

    product.variants = product.variants.filter((v) => incomingIds.has(variantId(v)));

    for (const v of incoming) {
      if (v.id && incomingIds.has(v.id)) {
        const target = product.variants.find((x) => variantId(x) === v.id);
        if (!target) continue;
        target.sku = v.sku;
        target.attributes = v.attributes ?? {};
        target.priceCents = v.priceCents;
        target.compareAtPriceCents = v.compareAtPriceCents ?? null;
        target.taxRate = v.taxRate ?? 0;
        target.images = v.images ?? [];
        target.isActive = v.isActive ?? true;
        // Stock counters are owned by the inventory module: quantity/lockout
        // changes on existing variants must go through inventory APIs so the
        // movement audit trail is preserved.
      } else {
        product.variants.push(normalizeVariantInput(v, true).variant as IVariant);
      }
    }
  }

  await product.save();
  recordAudit('product.updated', { productId: product._id.toString() }, { actorId });
  return toProductPublic(product);
}

export async function setProductStatus(
  productId: string,
  status: ProductStatus,
  actorId: string,
): Promise<ProductPublic> {
  const product = await Product.findById(productId);
  if (!product) throw AppError.notFound('Product not found');
  product.status = status;
  if (status === 'published' && !product.publishedAt) product.publishedAt = new Date();
  await product.save();
  recordAudit('product.status_changed', { productId, status }, { actorId });
  return toProductPublic(product);
}

export async function archiveProduct(productId: string, actorId: string): Promise<void> {
  const product = await Product.findById(productId);
  if (!product) throw AppError.notFound('Product not found');

  // Hard deletes would orphan order history, so archival is a soft delete:
  // the product stays in the database (orders keep their snapshots anyway)
  // but disappears from every catalog query and cannot be purchased.
  product.status = 'archived';
  product.isActive = false;
  product.publishedAt = null;
  await product.save();
  recordAudit('product.deleted', { productId }, { actorId });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CategoryPublic {
  id: string;
  name: string;
  slug: string;
  parent: string | null;
  description: string;
  isActive: boolean;
  order: number;
}

export async function listCategories(): Promise<CategoryPublic[]> {
  const categories = await Category.find().sort({ order: 1, name: 1 }).lean();
  return categories.map((c) => ({
    id: c._id.toString(),
    name: c.name,
    slug: c.slug,
    parent: c.parent?.toString() ?? null,
    description: c.description,
    isActive: c.isActive,
    order: c.order,
  }));
}

export async function createCategory(
  input: {
    name: string;
    parent?: string | null;
    description?: string;
    isActive?: boolean;
    order?: number;
  },
  actorId: string,
): Promise<CategoryPublic> {
  if (input.parent) {
    const parent = await Category.findById(input.parent);
    if (!parent) throw AppError.badRequest('Parent category does not exist');
  }
  const category = await Category.create({
    name: input.name,
    slug: await uniqueCategorySlug(input.name),
    parent: input.parent ?? null,
    description: input.description ?? '',
    isActive: input.isActive ?? true,
    order: input.order ?? 0,
  });
  recordAudit('category.created', { categoryId: category._id.toString() }, { actorId });
  return toCategoryPublic(category);
}

export async function updateCategory(
  categoryId: string,
  input: {
    name?: string;
    parent?: string | null;
    description?: string;
    isActive?: boolean;
    order?: number;
  },
  actorId: string,
): Promise<CategoryPublic> {
  const category = await Category.findById(categoryId);
  if (!category) throw AppError.notFound('Category not found');

  if (input.parent !== undefined) {
    if (input.parent) {
      if (input.parent === categoryId) {
        throw AppError.badRequest('A category cannot be its own parent');
      }
      const parent = await Category.findById(input.parent);
      if (!parent) throw AppError.badRequest('Parent category does not exist');
    }
    category.parent = (input.parent ?? null) as unknown as ICategory['parent'];
  }
  if (input.name !== undefined) category.name = input.name;
  if (input.description !== undefined) category.description = input.description;
  if (input.isActive !== undefined) category.isActive = input.isActive;
  if (input.order !== undefined) category.order = input.order;
  await category.save();
  recordAudit('category.updated', { categoryId }, { actorId });
  return toCategoryPublic(category);
}

export async function deleteCategory(categoryId: string, actorId: string): Promise<void> {
  const children = await Category.countDocuments({ parent: categoryId });
  if (children > 0) {
    throw AppError.badRequest('Category has subcategories; move or delete them first', {
      errorCode: 'CATEGORY_HAS_CHILDREN',
    });
  }
  const productCount = await Product.countDocuments({
    category: categoryId,
    status: { $ne: 'archived' },
  });
  if (productCount > 0) {
    throw AppError.badRequest('Category still contains products', { errorCode: 'CATEGORY_IN_USE' });
  }
  const result = await Category.deleteOne({ _id: categoryId });
  if (result.deletedCount === 0) throw AppError.notFound('Category not found');
  recordAudit('category.deleted', { categoryId }, { actorId });
}

function toCategoryPublic(category: {
  _id: unknown;
  name: string;
  slug: string;
  parent: unknown;
  description: string;
  isActive: boolean;
  order: number;
}): CategoryPublic {
  return {
    id: (category._id as { toString(): string }).toString(),
    name: category.name,
    slug: category.slug,
    parent: (category.parent as { toString(): string } | null)?.toString() ?? null,
    description: category.description,
    isActive: category.isActive,
    order: category.order,
  };
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export interface BrandPublic {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
}

export async function listBrands(): Promise<BrandPublic[]> {
  const brands = await Brand.find().sort({ name: 1 }).lean();
  return brands.map((b) => ({
    id: b._id.toString(),
    name: b.name,
    slug: b.slug,
    description: b.description,
    isActive: b.isActive,
  }));
}

export async function createBrand(
  input: { name: string; description?: string; isActive?: boolean },
  actorId: string,
): Promise<BrandPublic> {
  const brand = await Brand.create({
    name: input.name,
    slug: await uniqueBrandSlug(input.name),
    description: input.description ?? '',
    isActive: input.isActive ?? true,
  });
  recordAudit('brand.created', { brandId: brand._id.toString() }, { actorId });
  return toBrandPublic(brand);
}

export async function updateBrand(
  brandId: string,
  input: { name?: string; description?: string; isActive?: boolean },
  actorId: string,
): Promise<BrandPublic> {
  const brand = await Brand.findById(brandId);
  if (!brand) throw AppError.notFound('Brand not found');
  if (input.name !== undefined) brand.name = input.name;
  if (input.description !== undefined) brand.description = input.description;
  if (input.isActive !== undefined) brand.isActive = input.isActive;
  await brand.save();
  recordAudit('brand.updated', { brandId }, { actorId });
  return toBrandPublic(brand);
}

export async function deleteBrand(brandId: string, actorId: string): Promise<void> {
  const productCount = await Product.countDocuments({
    brand: brandId,
    status: { $ne: 'archived' },
  });
  if (productCount > 0) {
    throw AppError.badRequest('Brand still has products', { errorCode: 'BRAND_IN_USE' });
  }
  const result = await Brand.deleteOne({ _id: brandId });
  if (result.deletedCount === 0) throw AppError.notFound('Brand not found');
  recordAudit('brand.deleted', { brandId }, { actorId });
}

function toBrandPublic(brand: {
  _id: unknown;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
}): BrandPublic {
  return {
    id: (brand._id as { toString(): string }).toString(),
    name: brand.name,
    slug: brand.slug,
    description: brand.description,
    isActive: brand.isActive,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

async function ensureBrandExists(brandId: string): Promise<void> {
  const exists = await Brand.exists({ _id: brandId });
  if (!exists) throw AppError.badRequest('Brand does not exist');
}

async function ensureCategoryExists(categoryId: string): Promise<void> {
  const exists = await Category.exists({ _id: categoryId });
  if (!exists) throw AppError.badRequest('Category does not exist');
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'product';
  return makeUnique(base, (slug) => Product.exists({ slug }));
}

async function uniqueCategorySlug(name: string): Promise<string> {
  const base = slugify(name) || 'category';
  return makeUnique(base, (slug) => Category.exists({ slug }));
}

async function uniqueBrandSlug(name: string): Promise<string> {
  const base = slugify(name) || 'brand';
  return makeUnique(base, (slug) => Brand.exists({ slug }));
}

async function makeUnique(
  base: string,
  exists: (slug: string) => Promise<unknown>,
): Promise<string> {
  if (!(await exists(base))) return base;
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export { Product };
export type { IProduct };
