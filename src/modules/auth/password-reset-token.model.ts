import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface IPasswordResetToken {
  tokenHash: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PasswordResetTokenDocument = HydratedDocument<IPasswordResetToken>;

const passwordResetTokenSchema = new Schema<IPasswordResetToken, Model<IPasswordResetToken>>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetToken = model<IPasswordResetToken, Model<IPasswordResetToken>>(
  'PasswordResetToken',
  passwordResetTokenSchema,
);
