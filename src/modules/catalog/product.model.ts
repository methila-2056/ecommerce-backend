import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

// Prices are stored as integer cents to avoid floating-point money errors;
// every money value across the system follows this convention.
export interface IStock {
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
}

export interface IVariant {
  sku: string;
  attributes: Record<string, string>;
  priceCents: number;
  compareAtPriceCents: number | null;
  taxRate: number;
  stock: IStock;
  images: string[];
  isActive: boolean;
}

export interface ISpecification {
  key: string;
  value: string;
}

export interface IProduct {
  name: string;
  slug: string;
  summary: string;
  description: string;
  brand: Types.ObjectId | null;
  category: Types.ObjectId | null;
  createdBy: Types.ObjectId | null;
  images: string[];
  specs: ISpecification[];
  tags: string[];
  status: ProductStatus;
  isActive: boolean;
  publishedAt: Date | null;
  variants: IVariant[];
  averageRating: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ProductDocument = HydratedDocument<IProduct>;

const stockSchema = new Schema<IStock>(
  {
    quantity: { type: Number, required: true, min: 0, default: 0 },
    reserved: { type: Number, required: true, min: 0, default: 0 },
    available: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, required: true, min: 0, default: 5 },
  },
  { _id: false },
);

const variantSchema = new Schema<IVariant>(
  {
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 64 },
    attributes: { type: Schema.Types.Mixed, default: {} },
    priceCents: { type: Number, required: true, min: 0 },
    compareAtPriceCents: { type: Number, default: null, min: 0 },
    taxRate: { type: Number, required: true, min: 0, max: 100, default: 0 },
    stock: { type: stockSchema, required: true, default: () => ({}) },
    images: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

const productSchema = new Schema<IProduct, Model<IProduct>>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 220 },
    summary: { type: String, default: '', maxlength: 500 },
    description: { type: String, default: '', maxlength: 50_000 },
    brand: { type: Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    images: { type: [String], default: [] },
    specs: {
      type: [new Schema<ISpecification>({ key: String, value: String }, { _id: false })],
      default: [],
    },
    tags: { type: [String], default: [] },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'draft' },
    isActive: { type: Boolean, default: true },
    publishedAt: { type: Date, default: null },
    variants: { type: [variantSchema], required: true, default: [] },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

// Unique index backs slug lookups (product detail pages).
productSchema.index({ slug: 1 }, { unique: true });
// A SKU is globally unique — prevents two products silently sharing a SKU,
// which would corrupt inventory accounting.
productSchema.index({ 'variants.sku': 1 }, { unique: true });

// The two catalog query shapes that dominate:
//   1. Storefront: published + active products, newest first.
//   2. Admin: products in one category/brand regardless of status.
productSchema.index({ status: 1, isActive: 1, publishedAt: -1 });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ brand: 1, status: 1 });

// Keyword search across the human-readable fields.
productSchema.index(
  { name: 'text', summary: 'text', description: 'text', tags: 'text' },
  {
    name: 'product_text_search',
    default_language: 'english',
    weights: { name: 10, summary: 5, tags: 3, description: 1 },
  },
);

export const Product = model<IProduct, Model<IProduct>>('Product', productSchema);
