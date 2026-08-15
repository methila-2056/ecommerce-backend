import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import { sendSuccess } from '../../shared/utils/response.js';
import * as notificationService from './notification.service.js';

function requireUser(req: Request): { userId: string } {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  return { userId: req.user.userId };
}

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const query = req.query as { page?: number; limit?: number; unreadOnly?: string };
  const result = await notificationService.listNotifications(userId, query);
  sendSuccess(res, result.notifications, 'Notifications retrieved successfully', result.meta);
}

export async function unreadCount(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const count = await notificationService.unreadNotificationCount(userId);
  sendSuccess(res, { count }, 'Unread count retrieved');
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { notificationId } = req.params as { notificationId: string };
  await notificationService.markNotificationRead(userId, notificationId);
  sendSuccess(res, null, 'Notification marked as read');
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  await notificationService.markAllNotificationsRead(userId);
  sendSuccess(res, null, 'All notifications marked as read');
}
