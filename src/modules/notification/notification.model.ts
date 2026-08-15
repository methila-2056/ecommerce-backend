import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'order_placed',
  'order_confirmed',
  'payment_failed',
  'order_shipped',
  'order_delivered',
  'order_cancelled',
  'refund_requested',
  'refund_processed',
  'low_stock',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface INotification {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationDocument = HydratedDocument<INotification>;

const notificationSchema = new Schema<INotification, Model<INotification>>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 2000 },
    data: { type: Schema.Types.Mixed, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

export const Notification = model<INotification, Model<INotification>>(
  'Notification',
  notificationSchema,
);
