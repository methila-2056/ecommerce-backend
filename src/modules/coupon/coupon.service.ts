import { Types } from 'mongoose';
import { AppError } from '../../shared/errors/AppError.js';
import { recordAudit } from '../../shared/utils/audit.js';
import {
  buildPaginationMeta,
  toPageOptions,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import { Coupon, type CouponType, type CouponScope } from './coupon.model.js';
import { CouponUsage } from './coupon-usage.model.js';

export interface CouponPublic {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  scope: CouponScope;
  productIds: string[];
  categoryIds: string[];
  minOrderValueCents: number;
  maxDiscountCents: number | null;
  maxUses: number | null;
  perUserLimit: number;
  usedCount: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
}

function toCouponPublic(coupon: {
  _id: unknown;
  code: string;
  type: CouponType;
  value: number;
  scope: CouponScope;
  productIds: Array<{ toString(): string }>;
  categoryIds: Array<{ toString(): string }>;
  minOrderValueCents: number;
  maxDiscountCents: number | null;
  maxUses: number | null;
  perUserLimit: number;
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
}): CouponPublic {
  return {
    id: (coupon._id as { toString(): string }).toString(),
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    scope: coupon.scope,
    productIds: coupon.productIds.map((p) => p.toString()),
    categoryIds: coupon.categoryIds.map((c) => c.toString()),
    minOrderValueCents: coupon.minOrderValueCents,
    maxDiscountCents: coupon.maxDiscountCents,
    maxUses: coupon.maxUses,
    perUserLimit: coupon.perUserLimit,
    usedCount: coupon.usedCount,
    validFrom: coupon.validFrom.toISOString(),
    validUntil: coupon.validUntil.toISOString(),
    isActive: coupon.isActive,
  };
}

export async function createCoupon(
  input: {
    code: string;
    type: CouponType;
    value: number;
    scope?: CouponScope;
    productIds?: string[];
    categoryIds?: string[];
    minOrderValueCents?: number;
    maxDiscountCents?: number | null;
    maxUses?: number | null;
    perUserLimit?: number;
    validFrom?: Date | string;
    validUntil?: Date | string;
    isActive?: boolean;
  },
  actorId: string,
): Promise<CouponPublic> {
  const code = input.code.trim().toUpperCase();
  const coupon = await Coupon.create({
    code,
    type: input.type,
    value: input.value,
    scope: input.scope ?? 'all',
    productIds: input.productIds ?? [],
    categoryIds: input.categoryIds ?? [],
    minOrderValueCents: input.minOrderValueCents ?? 0,
    maxDiscountCents: input.maxDiscountCents ?? null,
    maxUses: input.maxUses ?? null,
    perUserLimit: input.perUserLimit ?? 1,
    usedCount: 0,
    validFrom: input.validFrom ? new Date(input.validFrom) : new Date(0),
    validUntil: input.validUntil ? new Date(input.validUntil) : new Date('2099-12-31T23:59:59Z'),
    isActive: input.isActive ?? true,
  });
  recordAudit('coupon.created', { couponId: coupon._id.toString(), code }, { actorId });
  return toCouponPublic(coupon);
}

export async function updateCoupon(
  couponId: string,
  input: Partial<Parameters<typeof createCoupon>[0]>,
  actorId: string,
): Promise<CouponPublic> {
  const coupon = await Coupon.findById(couponId);
  if (!coupon) throw AppError.notFound('Coupon not found');

  if (input.code !== undefined) coupon.code = input.code.trim().toUpperCase();
  if (input.type !== undefined) coupon.type = input.type;
  if (input.value !== undefined) coupon.value = input.value;
  if (input.scope !== undefined) coupon.scope = input.scope;
  if (input.productIds !== undefined)
    coupon.productIds = input.productIds.map((p) => new Types.ObjectId(p));
  if (input.categoryIds !== undefined)
    coupon.categoryIds = input.categoryIds.map((c) => new Types.ObjectId(c));
  if (input.minOrderValueCents !== undefined) coupon.minOrderValueCents = input.minOrderValueCents;
  if (input.maxDiscountCents !== undefined) coupon.maxDiscountCents = input.maxDiscountCents;
  if (input.maxUses !== undefined) coupon.maxUses = input.maxUses;
  if (input.perUserLimit !== undefined) coupon.perUserLimit = input.perUserLimit;
  if (input.validFrom !== undefined) coupon.validFrom = new Date(input.validFrom as Date | string);
  if (input.validUntil !== undefined)
    coupon.validUntil = new Date(input.validUntil as Date | string);
  if (input.isActive !== undefined) coupon.isActive = input.isActive;

  await coupon.save();
  recordAudit('coupon.updated', { couponId }, { actorId });
  return toCouponPublic(coupon);
}

export async function deleteCoupon(couponId: string, actorId: string): Promise<void> {
  const result = await Coupon.deleteOne({ _id: couponId });
  if (result.deletedCount === 0) throw AppError.notFound('Coupon not found');
  recordAudit('coupon.deleted', { couponId }, { actorId });
}

export async function listCoupons(query: {
  page?: number;
  limit?: number;
  isActive?: 'true' | 'false';
}): Promise<{ coupons: CouponPublic[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = {};
  if (query.isActive) filter.isActive = query.isActive === 'true';
  const options = toPageOptions(query);
  const [total, coupons] = await Promise.all([
    Coupon.countDocuments(filter),
    Coupon.find(filter).sort({ createdAt: -1 }).skip(options.skip).limit(options.limit).lean(),
  ]);
  return {
    coupons: coupons.map((c) =>
      toCouponPublic(c as unknown as Parameters<typeof toCouponPublic>[0]),
    ),
    meta: buildPaginationMeta(total, options),
  };
}

// ---------------------------------------------------------------------------
// Discount evaluation during checkout
// ---------------------------------------------------------------------------

export interface DiscountCartItem {
  productId: string;
  category: string | null;
  unitPriceCents: number;
  quantity: number;
}

export interface DiscountResult {
  code: string;
  couponId: string;
  discountCents: number;
}

// Pure computation, no DB writes: the order module re-checks limits inside its
// transaction before committing the coupon usage.
export async function computeDiscount(
  couponCode: string,
  userId: string,
  items: DiscountCartItem[],
): Promise<DiscountResult> {
  const coupon = await Coupon.findOne({ code: couponCode.trim().toUpperCase() });
  if (!coupon) throw AppError.badRequest('Invalid coupon code', { errorCode: 'INVALID_COUPON' });
  if (!coupon.isActive)
    throw AppError.badRequest('This coupon is no longer active', { errorCode: 'COUPON_INACTIVE' });

  const now = new Date();
  if (coupon.validFrom > now)
    throw AppError.badRequest('This coupon is not yet valid', { errorCode: 'COUPON_NOT_STARTED' });
  if (coupon.validUntil < now)
    throw AppError.badRequest('This coupon has expired', { errorCode: 'COUPON_EXPIRED' });

  const subtotal = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  if (subtotal < coupon.minOrderValueCents) {
    throw AppError.badRequest(
      `Minimum order value for this coupon is ${(coupon.minOrderValueCents / 100).toFixed(2)}`,
      { errorCode: 'COUPON_MIN_ORDER_NOT_MET' },
    );
  }

  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw AppError.badRequest('This coupon has reached its usage limit', {
      errorCode: 'COUPON_EXHAUSTED',
    });
  }

  const userUsage = await CouponUsage.countDocuments({ couponId: coupon._id, userId });
  if (userUsage >= coupon.perUserLimit) {
    throw AppError.badRequest('You have already used this coupon', {
      errorCode: 'COUPON_USER_LIMIT_REACHED',
    });
  }

  // Eligible subtotal depends on the coupon scope. For scoped coupons, the
  // discount only applies to matching items; if nothing matches, the coupon
  // simply cannot be used with this cart.
  let eligibleSubtotalCents = 0;
  for (const item of items) {
    const lineTotal = item.unitPriceCents * item.quantity;
    if (coupon.scope === 'all') {
      eligibleSubtotalCents += lineTotal;
    } else if (coupon.scope === 'category' && item.category) {
      if (coupon.categoryIds.some((id) => id.toString() === item.category))
        eligibleSubtotalCents += lineTotal;
    } else if (coupon.scope === 'product') {
      if (coupon.productIds.some((id) => id.toString() === item.productId))
        eligibleSubtotalCents += lineTotal;
    }
  }

  if (eligibleSubtotalCents <= 0) {
    throw AppError.badRequest('This coupon does not apply to any item in your cart', {
      errorCode: 'COUPON_NOT_APPLICABLE',
    });
  }

  let discountCents =
    coupon.type === 'percentage'
      ? Math.floor((eligibleSubtotalCents * coupon.value) / 100)
      : coupon.value;

  if (coupon.maxDiscountCents !== null)
    discountCents = Math.min(discountCents, coupon.maxDiscountCents);
  discountCents = Math.min(discountCents, eligibleSubtotalCents);

  return { code: coupon.code, couponId: coupon._id.toString(), discountCents };
}
