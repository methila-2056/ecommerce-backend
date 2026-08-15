import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import { recordAudit } from '../../shared/utils/audit.js';
import { generateSecureToken, sha256 } from '../../shared/utils/crypto.js';
import { expiresIn, ttlToMs } from '../../shared/utils/ttl.js';
import { emailProvider } from '../../integrations/email/email-provider.js';
import { toUserPublic, User, type UserDocument, type UserPublic } from '../user/user.model.js';
import { PasswordResetToken } from './password-reset-token.model.js';
import { hashPassword, verifyPassword } from './password.service.js';
import {
  createSession,
  listSessionsForUser,
  revokeAllSessions,
  revokeSessionById,
  rotateSession,
  type SessionMetadata,
  type SessionPublic,
} from './session.service.js';
import { signAccessToken } from './token.service.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInMs: number;
}

export interface LoginResult {
  user: UserPublic;
  tokens: AuthTokens;
}

// Compared against when the email is unknown so login timing does not reveal
// whether an account exists (user-enumeration defense).
const DUMMY_PASSWORD_HASH = await hashPassword('dummy-password-timing-equalizer');

async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const rawToken = generateSecureToken(24);
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        emailVerificationTokenHash: sha256(rawToken),
        emailVerificationExpiresAt: expiresIn(env.EMAIL_VERIFICATION_TOKEN_TTL),
      },
    },
  );
  await emailProvider.send({
    to: email,
    subject: 'Verify your email address',
    text: `Verify your email address by opening: ${env.FRONTEND_URL}/verify-email?token=${rawToken}`,
  });
  recordAudit('auth.email_verification_sent', { userId });
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<UserPublic> {
  const email = input.email.toLowerCase();
  const existing = await User.exists({ email });
  if (existing) {
    throw AppError.conflict('An account with this email already exists', {
      errorCode: 'EMAIL_TAKEN',
    });
  }

  const user = await User.create({
    name: input.name,
    email,
    passwordHash: await hashPassword(input.password),
  });

  // The unique index on email remains the final guard against a concurrent
  // double-registration race; a duplicate here surfaces as a 409 via the
  // central error handler.
  await sendVerificationEmail(user._id.toString(), email);
  recordAudit('auth.register', { userId: user._id.toString() });
  return toUserPublic(user);
}

export async function verifyEmail(token: string): Promise<UserPublic> {
  const result = await User.findOneAndUpdate(
    {
      emailVerifiedAt: null,
      emailVerificationTokenHash: sha256(token),
      emailVerificationExpiresAt: { $gt: new Date() },
    },
    {
      $set: { emailVerifiedAt: new Date() },
      $unset: { emailVerificationTokenHash: '' },
    },
    { new: true },
  );
  if (!result) {
    throw AppError.badRequest('Verification token is invalid or has expired', {
      errorCode: 'INVALID_TOKEN',
    });
  }
  recordAudit('auth.email_verified', { userId: result._id.toString() });
  return toUserPublic(result);
}

export async function resendVerificationEmail(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  // Unknown email or already-verified account both return successfully so the
  // endpoint cannot be used to enumerate which addresses exist.
  if (!user || user.emailVerifiedAt) return;
  await sendVerificationEmail(user._id.toString(), user.email);
}

export async function login(
  email: string,
  password: string,
  meta: SessionMetadata,
): Promise<LoginResult> {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  const now = new Date();

  if (user?.lockUntil && user.lockUntil > now) {
    const retryAfterSeconds = Math.ceil((user.lockUntil.getTime() - now.getTime()) / 1000);
    recordAudit('auth.login_blocked', { userId: user._id.toString(), ip: meta.ip });
    throw AppError.tooManyRequests('Account temporarily locked due to too many failed attempts', {
      errorCode: 'ACCOUNT_LOCKED',
      details: { retryAfterSeconds },
    });
  }

  const passwordValid = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, DUMMY_PASSWORD_HASH);

  if (!user || !passwordValid) {
    if (user) await handleFailedLogin(user, meta);
    throw AppError.unauthorized('Invalid email or password', { errorCode: 'INVALID_CREDENTIALS' });
  }

  if (user.status !== 'active') {
    throw AppError.forbidden('This account has been disabled', { errorCode: 'ACCOUNT_DISABLED' });
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = now;
  await user.save();

  const { sessionId, refreshToken } = await createSession(user._id.toString(), meta);
  const accessToken = await signAccessToken({
    userId: user._id.toString(),
    roles: user.roles,
    sessionId,
  });

  recordAudit('auth.login.success', { userId: user._id.toString(), ip: meta.ip });
  return {
    user: toUserPublic(user),
    tokens: { accessToken, refreshToken, expiresInMs: ttlToMs(env.ACCESS_TOKEN_TTL) },
  };
}

async function handleFailedLogin(
  user: Pick<UserDocument, 'failedLoginAttempts' | 'lockUntil' | 'save' | '_id'>,
  meta: SessionMetadata,
): Promise<void> {
  user.failedLoginAttempts += 1;
  if (user.failedLoginAttempts >= env.LOGIN_MAX_ATTEMPTS) {
    user.lockUntil = expiresIn(`${env.ACCOUNT_LOCK_MINUTES}m`);
    user.failedLoginAttempts = 0;
    recordAudit('auth.account_locked', { userId: user._id.toString(), ip: meta.ip });
  }
  await user.save();
}

export interface RefreshResult extends AuthTokens {
  sessionId: string;
}

export async function refresh(
  presentedToken: string,
  meta: SessionMetadata,
): Promise<RefreshResult> {
  const result = await rotateSession(presentedToken, meta);

  if (result.status === 'reuse') {
    recordAudit('auth.refresh_reuse', { ip: meta.ip });
    throw AppError.unauthorized('Session revoked; please sign in again', {
      errorCode: 'SESSION_REVOKED',
    });
  }
  if (result.status === 'invalid') {
    throw AppError.unauthorized('Invalid or expired refresh token', { errorCode: 'INVALID_TOKEN' });
  }

  const accessToken = await signAccessToken({
    userId: result.userId,
    roles: result.roles,
    sessionId: result.sessionId,
  });
  recordAudit('auth.refresh', { userId: result.userId });
  return {
    accessToken,
    refreshToken: result.refreshToken,
    expiresInMs: ttlToMs(env.ACCESS_TOKEN_TTL),
    sessionId: result.sessionId,
  };
}

export async function logout(userId: string, sessionId: string): Promise<void> {
  const revoked = await revokeSessionById(sessionId, userId, 'logout');
  if (!revoked) {
    // A stale access token whose session no longer exists is still a logout.
    recordAudit('auth.logout', { userId, sessionId, outcome: 'session_not_found' });
    return;
  }
  recordAudit('auth.logout', { userId, sessionId });
}

export async function logoutAll(userId: string): Promise<void> {
  await revokeAllSessions(userId, 'logout');
  recordAudit('auth.logout', { userId });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionId: string,
): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw AppError.notFound('User not found');

  const currentValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentValid) {
    throw AppError.badRequest('Current password is incorrect', {
      errorCode: 'INVALID_CURRENT_PASSWORD',
    });
  }
  if (currentPassword === newPassword) {
    throw AppError.badRequest('New password must be different from the current password');
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();

  // Changing the password signs every other device out; the current session
  // stays so the user is not logged out mid-action.
  await revokeAllSessions(userId, 'password_changed', { exceptSessionId: currentSessionId });
  recordAudit('auth.password_changed', { userId });
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  // Unknown email still returns the same success response (no enumeration).
  if (!user) {
    recordAudit('auth.password_reset_requested', { userId: 'unknown' });
    return;
  }

  const rawToken = generateSecureToken(24);
  // Only one active reset per account at a time prevents token spam.
  await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });
  await PasswordResetToken.create({
    tokenHash: sha256(rawToken),
    userId: user._id,
    expiresAt: expiresIn(env.PASSWORD_RESET_TOKEN_TTL),
  });

  await emailProvider.send({
    to: user.email,
    subject: 'Reset your password',
    text: `Reset your password by opening: ${env.FRONTEND_URL}/reset-password?token=${rawToken}`,
  });
  recordAudit('auth.password_reset_requested', { userId: user._id.toString() });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await PasswordResetToken.findOne({ tokenHash: sha256(token), usedAt: null });
  if (!record || record.expiresAt <= new Date()) {
    throw AppError.badRequest('Reset token is invalid or has expired', {
      errorCode: 'INVALID_TOKEN',
    });
  }

  const user = await User.findById(record.userId).select('+passwordHash');
  if (!user) throw AppError.notFound('User not found');

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  // Receiving a reset email proves mailbox ownership, so verification completes.
  if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
  await user.save();

  record.usedAt = new Date();
  await record.save();

  await revokeAllSessions(user._id.toString(), 'password_changed');
  recordAudit('auth.password_reset', { userId: user._id.toString() });
}

export async function listSessions(
  userId: string,
  currentSessionId: string,
): Promise<SessionPublic[]> {
  return listSessionsForUser(userId, currentSessionId);
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  // Ownership is enforced in the query (sessionId AND userId) so one user can
  // never revoke another user's session (IDOR protection).
  const revoked = await revokeSessionById(sessionId, userId, 'revoked');
  if (!revoked) throw AppError.notFound('Session not found');
  recordAudit('auth.logout', { userId, sessionId });
}

export async function getMe(userId: string): Promise<UserPublic> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  return toUserPublic(user);
}
