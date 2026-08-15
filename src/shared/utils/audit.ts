import { logger } from '../../config/logger.js';

// Auditable business events. Each event is emitted as a structured log line
// (queryable in production) AND persisted to the AuditLog collection so admins
// can review security/business history. The event name is deliberately part of
// the code (a union) so events cannot be mistyped.
export type AuditEvent =
  // Authentication
  | 'auth.register'
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.account_locked'
  | 'auth.login_blocked'
  | 'auth.logout'
  | 'auth.refresh'
  | 'auth.refresh_reuse'
  | 'auth.password_changed'
  | 'auth.password_reset_requested'
  | 'auth.password_reset'
  | 'auth.email_verification_sent'
  | 'auth.email_verified'
  // Users
  | 'user.profile_updated'
  | 'user.address_added'
  | 'user.address_updated'
  | 'user.address_removed'
  | 'user.address_set_default'
  | 'user.account_deactivated'
  | 'user.status_changed'
  | 'user.roles_changed'
  // Catalog
  | 'category.created'
  | 'category.updated'
  | 'category.deleted'
  | 'brand.created'
  | 'brand.updated'
  | 'brand.deleted'
  | 'product.created'
  | 'product.updated'
  | 'product.status_changed'
  | 'product.deleted'
  // Inventory
  | 'inventory.restocked'
  | 'inventory.reserved'
  | 'inventory.released'
  | 'inventory.deducted'
  | 'inventory.adjusted'
  // Cart
  | 'cart.item_added'
  | 'cart.item_updated'
  | 'cart.item_removed'
  | 'cart.cleared'
  // Orders
  | 'order.created'
  | 'order.status_changed'
  | 'order.cancelled'
  | 'order.refund_requested'
  | 'order.return_requested'
  // Payments
  | 'payment.created'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded'
  | 'payment.refund_processed'
  | 'payment.webhook_received'
  | 'payment.webhook_orphan'
  // Coupons
  | 'coupon.created'
  | 'coupon.updated'
  | 'coupon.deleted'
  | 'coupon.redeemed'
  // Wishlist
  | 'wishlist.item_added'
  | 'wishlist.item_removed'
  // Reviews
  | 'review.created'
  | 'review.updated'
  | 'review.deleted'
  | 'review.moderated'
  // Notifications
  | 'notification.sent'
  | 'notification.job_failed'
  // Security / system
  | 'security.rate_limited'
  | 'system.startup'
  | 'system.shutdown';

export interface AuditContext {
  actorId?: string;
  ip?: string | null;
  userAgent?: string | null;
}

// Fire-and-forget persistence: audit writes must never block the request that
// triggered them, so failures are logged and swallowed. `recordAudit` is also
// safe to call before the database is connected (during startup).
function persist(event: AuditEvent, meta: Record<string, unknown>, context: AuditContext): void {
  void import('../../modules/audit/audit-log.model.js')
    .then(({ AuditLog }) =>
      AuditLog.create({
        event,
        meta,
        actorId: context.actorId ?? (typeof meta.actorId === 'string' ? meta.actorId : null),
        ip: context.ip ?? (typeof meta.ip === 'string' ? meta.ip : null),
        userAgent: context.userAgent ?? null,
      }),
    )
    .catch((err: unknown) => {
      logger.warn({ err, event }, 'Failed to persist audit event');
    });
}

export function recordAudit(
  event: AuditEvent,
  meta: Record<string, unknown> = {},
  context: AuditContext = {},
): void {
  logger.info({ audit: true, event, ...meta }, event);
  persist(event, meta, context);
}
