import { Types } from 'mongoose';
import { AppError } from '../../shared/errors/AppError.js';
import {
  buildPaginationMeta,
  toPageOptions,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import { AuditLog } from '../audit/audit-log.model.js';
import { Product } from '../catalog/product.model.js';
import { listLowStock } from '../inventory/inventory.service.js';
import { Order, type OrderDocument, type OrderStatus } from '../order/order.model.js';
import { toOrderPublic } from '../order/order.service.js';
import { User } from '../user/user.model.js';

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  revenueCents: number;
  paidOrdersCount: number;
  avgOrderValueCents: number;
  ordersByStatus: Record<string, number>;
  totalOrders: number;
  totalUsers: number;
  activeCustomers: number;
  publishedProducts: number;
  lowStockCount: number;
  recentOrders: ReturnType<typeof toOrderPublic>[];
  topProducts: Array<{
    productId: string;
    name: string;
    quantitySold: number;
    revenueCents: number;
  }>;
  topCustomers: Array<{ userId: string; name: string; orderCount: number; spentCents: number }>;
  revenueByDay: Array<{ date: string; revenueCents: number; orders: number }>;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const PAID_STATUSES: OrderStatus[] = [
    'confirmed',
    'processing',
    'packed',
    'shipped',
    'delivered',
  ];

  const [
    revenueAgg,
    statusAgg,
    userCount,
    activeCustomers,
    publishedProducts,
    lowStock,
    recent,
    topProductsAgg,
    topCustomersAgg,
    revenueByDayAgg,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { status: { $in: PAID_STATUSES } } },
      { $group: { _id: null, revenueCents: { $sum: '$totalCents' }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.countDocuments(),
    User.countDocuments({ roles: 'CUSTOMER', status: 'active' }),
    Product.countDocuments({ status: 'published', isActive: true }),
    listLowStock(),
    Order.find({ status: { $in: PAID_STATUSES } })
      .sort({ placedAt: -1 })
      .limit(5),
    Order.aggregate([
      { $match: { status: { $in: PAID_STATUSES } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          quantitySold: { $sum: '$items.quantity' },
          revenueCents: { $sum: '$items.lineTotalCents' },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 5 },
    ]),
    Order.aggregate([
      { $match: { status: { $in: PAID_STATUSES } } },
      {
        $group: {
          _id: '$userId',
          orderCount: { $sum: 1 },
          spentCents: { $sum: '$totalCents' },
        },
      },
      { $sort: { spentCents: -1 } },
      { $limit: 5 },
    ]),
    Order.aggregate([
      {
        $match: {
          status: { $in: PAID_STATUSES },
          placedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } },
          revenueCents: { $sum: '$totalCents' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const revenueRow = revenueAgg[0] as { revenueCents: number; count: number } | undefined;
  const revenueCents = revenueRow?.revenueCents ?? 0;
  const paidOrdersCount = revenueRow?.count ?? 0;

  const ordersByStatus: Record<string, number> = {};
  for (const row of statusAgg as Array<{ _id: string; count: number }>) {
    ordersByStatus[row._id] = row.count;
  }

  // Resolve product names and customer names for the leaderboards.
  const productIds = topProductsAgg.map((p: { _id: unknown }) =>
    (p._id as { toString(): string }).toString(),
  );
  const products = await Product.find({ _id: { $in: productIds } })
    .select('name')
    .lean();
  const productNameById = new Map(products.map((p) => [p._id.toString(), p.name]));

  const customerIds = topCustomersAgg.map((c: { _id: unknown }) =>
    (c._id as { toString(): string }).toString(),
  );
  const customers = await User.find({ _id: { $in: customerIds } })
    .select('name')
    .lean();
  const customerNameById = new Map(customers.map((u) => [u._id.toString(), u.name]));

  return {
    revenueCents,
    paidOrdersCount,
    avgOrderValueCents: paidOrdersCount > 0 ? Math.round(revenueCents / paidOrdersCount) : 0,
    ordersByStatus,
    totalOrders: Object.values(ordersByStatus).reduce((a, b) => a + b, 0),
    totalUsers: userCount,
    activeCustomers,
    publishedProducts,
    lowStockCount: lowStock.length,
    recentOrders: recent.map((order) => toOrderPublic(order as OrderDocument)),
    topProducts: topProductsAgg.map(
      (p: { _id: unknown; quantitySold: number; revenueCents: number }) => ({
        productId: (p._id as { toString(): string }).toString(),
        name:
          productNameById.get((p._id as { toString(): string }).toString()) ?? 'Unknown product',
        quantitySold: p.quantitySold,
        revenueCents: p.revenueCents,
      }),
    ),
    topCustomers: topCustomersAgg.map(
      (c: { _id: unknown; orderCount: number; spentCents: number }) => ({
        userId: (c._id as { toString(): string }).toString(),
        name: customerNameById.get((c._id as { toString(): string }).toString()) ?? 'Unknown user',
        orderCount: c.orderCount,
        spentCents: c.spentCents,
      }),
    ),
    revenueByDay: revenueByDayAgg.map(
      (r: { _id: string; revenueCents: number; orders: number }) => ({
        date: r._id,
        revenueCents: r.revenueCents,
        orders: r.orders,
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Audit log queries
// ---------------------------------------------------------------------------

export interface AuditLogPublic {
  id: string;
  event: string;
  meta: Record<string, unknown>;
  actorId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export async function listAuditLogs(query: {
  page?: number;
  limit?: number;
  event?: string;
  actorId?: string;
  from?: string;
  to?: string;
}): Promise<{ logs: AuditLogPublic[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = {};
  if (query.event) filter.event = query.event;
  if (query.actorId) filter.actorId = query.actorId;
  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) range.$gte = new Date(query.from);
    if (query.to) range.$lte = new Date(query.to);
    filter.createdAt = range;
  }

  const options = toPageOptions(query);
  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(options.skip).limit(options.limit).lean(),
  ]);

  return {
    logs: logs.map((log) => ({
      id: log._id.toString(),
      event: log.event,
      meta: log.meta,
      actorId: log.actorId,
      ip: log.ip,
      userAgent: log.userAgent,
      createdAt: log.createdAt.toISOString(),
    })),
    meta: buildPaginationMeta(total, options),
  };
}

// ---------------------------------------------------------------------------
// Product analytics (staff)
// ---------------------------------------------------------------------------

export async function getProductPerformance(productId: string): Promise<{
  productId: string;
  quantitySold: number;
  revenueCents: number;
  unitsReserved: number;
}> {
  if (!Types.ObjectId.isValid(productId)) {
    throw AppError.badRequest('Invalid product identifier');
  }
  const agg = await Order.aggregate([
    { $match: { status: { $in: ['confirmed', 'processing', 'packed', 'shipped', 'delivered'] } } },
    { $unwind: '$items' },
    { $match: { 'items.productId': new Types.ObjectId(productId) } },
    {
      $group: {
        _id: null,
        quantitySold: { $sum: '$items.quantity' },
        revenueCents: { $sum: '$items.lineTotalCents' },
      },
    },
  ]);
  const row = agg[0] as { quantitySold: number; revenueCents: number } | undefined;

  const product = await Product.findOne({ _id: productId }).lean();
  const unitsReserved =
    (product?.variants as unknown as Array<{ stock: { reserved: number } }> | undefined)?.reduce(
      (sum, v) => sum + v.stock.reserved,
      0,
    ) ?? 0;

  return {
    productId,
    quantitySold: row?.quantitySold ?? 0,
    revenueCents: row?.revenueCents ?? 0,
    unitsReserved,
  };
}
