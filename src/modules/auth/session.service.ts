import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { generateSecureToken, sha256 } from '../../shared/utils/crypto.js';
import { expiresIn } from '../../shared/utils/ttl.js';
import type { Role } from '../../types/roles.js';
import { User } from '../user/user.model.js';
import {
  RefreshSession,
  SESSION_REVOCATION_REASONS,
  type SessionRevocationReason,
} from './refresh-session.model.js';

export interface SessionMetadata {
  ip: string | null;
  userAgent: string | null;
}

export interface CreatedSession {
  sessionId: string;
  refreshToken: string;
}

export interface SessionPublic {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  active: boolean;
  current: boolean;
}

// Refresh tokens are opaque 256-bit random values, never JWTs. A token carries
// no identity itself; it is just a key into a server-side session row. This is
// what makes per-session revocation and reuse detection possible. Only the
// SHA-256 hash of a token is stored, so a leaked database cannot be replayed.
export async function createSession(
  userId: string,
  meta: SessionMetadata,
  existingFamilyId?: string,
): Promise<CreatedSession> {
  const familyId = existingFamilyId ?? randomUUID();
  const refreshToken = generateSecureToken(32);
  const session = await RefreshSession.create({
    userId,
    familyId,
    tokenHash: sha256(refreshToken),
    ip: meta.ip,
    userAgent: meta.userAgent,
    expiresAt: expiresIn(env.REFRESH_TOKEN_TTL),
  });
  return { sessionId: session._id.toString(), refreshToken };
}

export type RotateResult =
  | { status: 'ok'; sessionId: string; refreshToken: string; userId: string; roles: Role[] }
  | { status: 'invalid' }
  | { status: 'reuse' };

export async function rotateSession(
  presentedToken: string,
  meta: SessionMetadata,
): Promise<RotateResult> {
  // The opaque refresh token is the lookup key: we find the session by the
  // SHA-256 of the presented token. This is exactly why only hashes are stored.
  const session = await RefreshSession.findOne({ tokenHash: sha256(presentedToken) });
  const now = new Date();
  if (!session || session.expiresAt <= now) {
    return { status: 'invalid' };
  }

  // A presented token whose session is already revoked (e.g. it was rotated
  // away moments ago) means the token was almost certainly stolen and replayed.
  // Burn the entire family so every device in it is signed out.
  if (session.revokedAt !== null) {
    await revokeFamily(session.familyId, 'family_revoked');
    return { status: 'reuse' };
  }

  const user = await User.findById(session.userId).lean();
  if (!user || user.status !== 'active') {
    await revokeFamily(session.familyId, 'family_revoked');
    return { status: 'invalid' };
  }

  await RefreshSession.updateOne(
    { _id: session._id },
    { $set: { revokedAt: now, revokedReason: 'rotated', lastUsedAt: now } },
  );

  const created = await createSession(user._id.toString(), meta, session.familyId);
  return { status: 'ok', ...created, userId: user._id.toString(), roles: user.roles };
}

async function revokeFamily(familyId: string, reason: SessionRevocationReason): Promise<void> {
  await RefreshSession.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

export async function revokeSessionById(
  sessionId: string,
  userId: string,
  reason: SessionRevocationReason,
): Promise<boolean> {
  const result = await RefreshSession.updateOne(
    { _id: sessionId, userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
  return result.matchedCount > 0;
}

export async function revokeAllSessions(
  userId: string,
  reason: SessionRevocationReason,
  options: { exceptSessionId?: string } = {},
): Promise<void> {
  const filter: Record<string, unknown> = { userId, revokedAt: null };
  if (options.exceptSessionId) filter._id = { $ne: options.exceptSessionId };
  await RefreshSession.updateMany(filter, {
    $set: { revokedAt: new Date(), revokedReason: reason },
  });
}

export async function listSessionsForUser(
  userId: string,
  currentSessionId: string,
): Promise<SessionPublic[]> {
  const sessions = await RefreshSession.find({ userId }).sort({ createdAt: -1 }).limit(50);
  return sessions.map((session) => ({
    id: session._id.toString(),
    ip: session.ip,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
    expiresAt: session.expiresAt.toISOString(),
    active: session.revokedAt === null && session.expiresAt > new Date(),
    current: session._id.toString() === currentSessionId,
  }));
}

export { SESSION_REVOCATION_REASONS };
