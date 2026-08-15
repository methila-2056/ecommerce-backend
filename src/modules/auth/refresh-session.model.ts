import type { Types } from 'mongoose';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export const SESSION_REVOCATION_REASONS = [
  'logout',
  'rotated',
  'revoked',
  'password_changed',
  'family_revoked',
  'account_deactivated',
  'suspended',
] as const;
export type SessionRevocationReason = (typeof SESSION_REVOCATION_REASONS)[number];

export interface IRefreshSession {
  userId: Types.ObjectId;
  // Tokens in the same rotation family share this id. If an old, already
  // rotated token is presented again, the whole family is revoked (the token
  // was almost certainly stolen) — this is the reuse-detection guard.
  familyId: string;
  // SHA-256 of the raw refresh token. The raw JWT is never stored.
  tokenHash: string;
  ip: string | null;
  userAgent: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: SessionRevocationReason | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RefreshSessionDocument = HydratedDocument<IRefreshSession>;

const refreshSessionSchema = new Schema<IRefreshSession, Model<IRefreshSession>>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, select: false },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 500 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: SESSION_REVOCATION_REASONS, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// TTL index: expired sessions are purged by MongoDB automatically, so the
// collection cannot grow without bound.
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession = model<IRefreshSession, Model<IRefreshSession>>(
  'RefreshSession',
  refreshSessionSchema,
);
