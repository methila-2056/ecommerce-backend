import type { ClientSession } from 'mongoose';
import { AppError } from '../../shared/errors/AppError.js';
import { recordAudit } from '../../shared/utils/audit.js';
import {
  buildPaginationMeta,
  toPageOptions,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import { Product } from '../catalog/product.model.js';
import { InventoryMovement, type MovementType } from './inventory.model.js';

export interface StockSnapshot {
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
}

export interface MovementReference {
  referenceType: 'order' | 'orderItem' | 'manual';
  referenceId?: string;
}

interface MovementContext extends MovementReference {
  actorId?: string;
}

async function recordMovement(
  productId: string,
  variantId: string,
  sku: string,
  type: MovementType,
  quantity: number,
  beforeAvailable: number | null,
  afterAvailable: number | null,
  reason: string,
  context: MovementContext,
): Promise<void> {
  await InventoryMovement.create({
    productId,
    variantId,
    sku,
    type,
    quantity,
    beforeAvailable,
    afterAvailable,
    reason,
    referenceType: context.referenceType,
    referenceId: context.referenceId ?? null,
    actorId: context.actorId ?? null,
  });
}

function extractVariant(
  document: { variants: ReadonlyArray<{ _id?: unknown; sku: string; stock: StockSnapshot }> },
  variantId: string,
) {
  const variant = document.variants.find(
    (v) => (v._id as { toString(): string }).toString() === variantId,
  );
  return variant;
}

// ---------------------------------------------------------------------------
// Concurrency-safe stock operations
//
// Overselling is prevented at the database level: each operation is a single
// atomic findOneAndUpdate whose filter includes the stock guard (e.g.
// available >= qty). Two simultaneous reservations cannot both pass the guard,
// so it is impossible to reserve more than is available regardless of how many
// replicas/instances are running.
// ---------------------------------------------------------------------------

export async function reserveStock(
  productId: string,
  variantId: string,
  quantity: number,
  reason: string,
  context: MovementContext,
  session?: ClientSession,
): Promise<StockSnapshot> {
  const updated = await Product.findOneAndUpdate(
    {
      _id: productId,
      'variants._id': variantId,
      'variants.isActive': true,
      'variants.stock.available': { $gte: quantity },
    },
    { $inc: { 'variants.$.stock.reserved': quantity, 'variants.$.stock.available': -quantity } },
    { new: true, session },
  ).lean();

  if (!updated) {
    const exists = await Product.exists({ _id: productId, 'variants._id': variantId });
    if (!exists) throw AppError.notFound('Product variant not found');
    throw AppError.conflict('Insufficient stock for reservation', {
      errorCode: 'INSUFFICIENT_STOCK',
    });
  }

  const variant = extractVariant(updated, variantId);
  if (!variant) throw AppError.internal('Variant missing after stock update');
  const after = variant.stock.available;
  await recordMovement(
    productId,
    variantId,
    variant.sku,
    'reservation',
    -quantity,
    after + quantity,
    after,
    reason,
    context,
  );
  return variant.stock;
}

export async function releaseStock(
  productId: string,
  variantId: string,
  quantity: number,
  reason: string,
  context: MovementContext,
  session?: ClientSession,
): Promise<StockSnapshot> {
  const updated = await Product.findOneAndUpdate(
    {
      _id: productId,
      'variants._id': variantId,
      'variants.stock.reserved': { $gte: quantity },
    },
    { $inc: { 'variants.$.stock.reserved': -quantity, 'variants.$.stock.available': quantity } },
    { new: true, session },
  ).lean();

  if (!updated) {
    throw AppError.conflict('Cannot release more stock than is reserved', {
      errorCode: 'RESERVATION_MISMATCH',
    });
  }

  const variant = extractVariant(updated, variantId);
  if (!variant) throw AppError.internal('Variant missing after stock update');
  const after = variant.stock.available;
  await recordMovement(
    productId,
    variantId,
    variant.sku,
    'release',
    quantity,
    after - quantity,
    after,
    reason,
    context,
  );
  return variant.stock;
}

// A confirmed/paid order converts reservation into a sale: reserved decreases
// and total quantity decreases; available is untouched (it already dropped at
// reservation time).
export async function deductStock(
  productId: string,
  variantId: string,
  quantity: number,
  reason: string,
  context: MovementContext,
  session?: ClientSession,
): Promise<StockSnapshot> {
  const updated = await Product.findOneAndUpdate(
    {
      _id: productId,
      'variants._id': variantId,
      'variants.stock.reserved': { $gte: quantity },
    },
    { $inc: { 'variants.$.stock.reserved': -quantity, 'variants.$.stock.quantity': -quantity } },
    { new: true, session },
  ).lean();

  if (!updated) {
    throw AppError.conflict('Cannot deduct more stock than is reserved', {
      errorCode: 'RESERVATION_MISMATCH',
    });
  }

  const variant = extractVariant(updated, variantId);
  if (!variant) throw AppError.internal('Variant missing after stock update');
  await recordMovement(
    productId,
    variantId,
    variant.sku,
    'sale',
    -quantity,
    variant.stock.available,
    variant.stock.available,
    reason,
    context,
  );
  return variant.stock;
}

export async function restock(
  productId: string,
  variantId: string,
  quantity: number,
  reason: string,
  actorId: string,
): Promise<StockSnapshot> {
  const updated = await Product.findOneAndUpdate(
    { _id: productId, 'variants._id': variantId },
    { $inc: { 'variants.$.stock.quantity': quantity, 'variants.$.stock.available': quantity } },
    { new: true },
  ).lean();

  if (!updated) throw AppError.notFound('Product variant not found');

  const variant = extractVariant(updated, variantId);
  if (!variant) throw AppError.internal('Variant missing after stock update');
  const after = variant.stock.available;
  await recordMovement(
    productId,
    variantId,
    variant.sku,
    'restock',
    quantity,
    after - quantity,
    after,
    reason,
    { referenceType: 'manual', actorId },
  );
  recordAudit(
    'inventory.restocked',
    { productId, variantId, quantity, sku: variant.sku },
    { actorId },
  );
  return variant.stock;
}

// Manual reconciliation: sets the physical quantity to an absolute value and
// adjusts available by the same delta. Deliberately not guarded atomically —
// manual corrections are low-concurrency admin actions, unlike reservations.
export async function adjustStock(
  productId: string,
  variantId: string,
  newQuantity: number,
  reason: string,
  actorId: string,
): Promise<StockSnapshot> {
  const product = await Product.findOne({ _id: productId, 'variants._id': variantId });
  if (!product) throw AppError.notFound('Product variant not found');

  const current = extractVariant(product, variantId);
  if (!current) throw AppError.internal('Variant missing');

  const delta = newQuantity - current.stock.quantity;
  if (delta === 0) return current.stock;

  const newAvailable = current.stock.available + delta;
  if (newAvailable < 0) {
    throw AppError.badRequest(
      'Adjustment would make available stock negative; release reservations first',
      { errorCode: 'NEGATIVE_AVAILABLE_STOCK' },
    );
  }

  const updated = await Product.findOneAndUpdate(
    { _id: productId, 'variants._id': variantId },
    {
      $inc: { 'variants.$.stock.quantity': delta, 'variants.$.stock.available': delta },
    },
    { new: true },
  ).lean();
  if (!updated) throw AppError.internal('Stock update failed');

  const variant = extractVariant(updated, variantId);
  if (!variant) throw AppError.internal('Variant missing after stock update');
  const after = variant.stock.available;
  await recordMovement(
    productId,
    variantId,
    variant.sku,
    'adjustment',
    delta,
    after - delta,
    after,
    reason,
    { referenceType: 'manual', actorId },
  );
  recordAudit('inventory.adjusted', { productId, variantId, delta, reason }, { actorId });
  return variant.stock;
}

export async function getStock(productId: string, variantId: string): Promise<StockSnapshot> {
  const product = await Product.findOne({ _id: productId, 'variants._id': variantId }).lean();
  if (!product) throw AppError.notFound('Product variant not found');
  const variant = extractVariant(product, variantId);
  if (!variant) throw AppError.notFound('Product variant not found');
  return variant.stock;
}

export interface MovementPublic {
  id: string;
  productId: string;
  variantId: string;
  sku: string;
  type: MovementType;
  quantity: number;
  beforeAvailable: number | null;
  afterAvailable: number | null;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export async function listMovements(query: {
  page?: number;
  limit?: number;
  productId?: string;
  variantId?: string;
  type?: MovementType;
  sku?: string;
}): Promise<{ movements: MovementPublic[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = {};
  if (query.productId) filter.productId = query.productId;
  if (query.variantId) filter.variantId = query.variantId;
  if (query.type) filter.type = query.type;
  if (query.sku) filter.sku = query.sku.toUpperCase();

  const options = toPageOptions(query);
  const [total, movements] = await Promise.all([
    InventoryMovement.countDocuments(filter),
    InventoryMovement.find(filter)
      .sort({ createdAt: -1 })
      .skip(options.skip)
      .limit(options.limit)
      .lean(),
  ]);

  return {
    movements: movements.map((m) => ({
      id: m._id.toString(),
      productId: m.productId.toString(),
      variantId: m.variantId.toString(),
      sku: m.sku,
      type: m.type,
      quantity: m.quantity,
      beforeAvailable: m.beforeAvailable,
      afterAvailable: m.afterAvailable,
      reason: m.reason,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      createdAt: m.createdAt.toISOString(),
    })),
    meta: buildPaginationMeta(total, options),
  };
}

export interface LowStockItem {
  productId: string;
  name: string;
  sku: string;
  variantId: string;
  available: number;
  lowStockThreshold: number;
}

// Any active variant whose available stock has dropped to or below its
// threshold. Used by the admin dashboard and the low-stock notification job.
export async function listLowStock(): Promise<LowStockItem[]> {
  const products = await Product.aggregate([
    {
      $match: {
        status: 'published',
        isActive: true,
        variants: { $elemMatch: { isActive: true } },
      },
    },
    { $unwind: '$variants' },
    {
      $match: {
        'variants.isActive': true,
        $expr: { $lte: ['$variants.stock.available', '$variants.stock.lowStockThreshold'] },
      },
    },
    { $sort: { 'variants.stock.available': 1 } },
  ]);

  return products.map((p) => ({
    productId: p._id.toString(),
    name: p.name,
    sku: p.variants.sku,
    variantId: p.variants._id.toString(),
    available: p.variants.stock.available,
    lowStockThreshold: p.variants.stock.lowStockThreshold,
  }));
}

export type { MovementType };
