import {
  buildPaginationMeta,
  toPageOptions,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import { Notification, type NotificationType } from './notification.model.js';

// Fire-and-forget push for in-app notifications. Wrapped in try/catch so an
// email/inbox failure can never break the business operation that triggered it
// (checkout, payment webhook, etc.).
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await Notification.create({ userId, type, title, body, data: data ?? null });
  } catch {
    // Logging the failure is handled by the global error path; the caller must
    // not throw because notifications are best-effort by design.
  }
}

export interface NotificationPublic {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

function toNotificationPublic(n: {
  _id: unknown;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationPublic {
  return {
    id: (n._id as { toString(): string }).toString(),
    type: n.type,
    title: n.title,
    body: n.body,
    data: n.data,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listNotifications(
  userId: string,
  query: { page?: number; limit?: number; unreadOnly?: string },
): Promise<{ notifications: NotificationPublic[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = { userId };
  if (query.unreadOnly === 'true') filter.readAt = null;
  const options = toPageOptions(query);
  const [total, notifications] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(options.skip)
      .limit(options.limit)
      .lean(),
  ]);
  return {
    notifications: notifications.map((n) =>
      toNotificationPublic(n as Parameters<typeof toNotificationPublic>[0]),
    ),
    meta: buildPaginationMeta(total, options),
  };
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  return Notification.countDocuments({ userId, readAt: null });
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  const result = await Notification.updateOne(
    { _id: notificationId, userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    // Already read or not owned by this user — treat as a no-op.
    return;
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
}
