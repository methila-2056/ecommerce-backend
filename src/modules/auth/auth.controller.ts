import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import { sendSuccess } from '../../shared/utils/response.js';
import { clearRefreshCookie, getRefreshToken, setRefreshCookie } from './auth-cookie.js';
import * as authService from './auth.service.js';

function sessionMeta(req: Request): { ip: string | null; userAgent: string | null } {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string' && forwarded.length > 0
      ? (forwarded.split(',')[0]?.trim() ?? null)
      : (req.ip ?? null);
  return { ip, userAgent: (req.headers['user-agent'] ?? null)?.slice(0, 500) ?? null };
}

function requireUser(req: Request): { userId: string; sessionId: string } {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  return { userId: req.user.userId, sessionId: req.user.sessionId };
}

export async function register(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.body as {
    name: string;
    email: string;
    password: string;
  };
  const user = await authService.register({ name, email, password });
  sendSuccess(
    res,
    user,
    'Registration successful. Verify your email to activate your account.',
    undefined,
    201,
  );
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = req.query as { token: string };
  const user = await authService.verifyEmail(token);
  sendSuccess(res, user, 'Email verified successfully');
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };
  await authService.resendVerificationEmail(email);
  sendSuccess(res, null, 'If the account exists, a verification email has been sent.');
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  const result = await authService.login(email, password, sessionMeta(req));
  setRefreshCookie(res, result.tokens.refreshToken);
  sendSuccess(
    res,
    {
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresInMs: result.tokens.expiresInMs,
    },
    'Login successful',
  );
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = getRefreshToken(req);
  if (!token) {
    throw AppError.unauthorized('Refresh token is required', {
      errorCode: 'MISSING_REFRESH_TOKEN',
    });
  }
  const result = await authService.refresh(token, sessionMeta(req));
  setRefreshCookie(res, result.refreshToken);
  sendSuccess(
    res,
    {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresInMs: result.expiresInMs,
      sessionId: result.sessionId,
    },
    'Token refreshed successfully',
  );
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { userId, sessionId } = requireUser(req);
  await authService.logout(userId, sessionId);
  clearRefreshCookie(res);
  sendSuccess(res, null, 'Logged out successfully');
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  await authService.logoutAll(userId);
  clearRefreshCookie(res);
  sendSuccess(res, null, 'Logged out of all devices');
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const { userId, sessionId } = requireUser(req);
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };
  await authService.changePassword(userId, currentPassword, newPassword, sessionId);
  sendSuccess(res, null, 'Password changed successfully');
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };
  await authService.forgotPassword(email);
  sendSuccess(
    res,
    null,
    'If the account exists, a password reset email has been sent.',
    undefined,
    202,
  );
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = req.body as { token: string; newPassword: string };
  await authService.resetPassword(token, newPassword);
  sendSuccess(res, null, 'Password has been reset. Please sign in.');
}

export async function listSessions(req: Request, res: Response): Promise<void> {
  const { userId, sessionId } = requireUser(req);
  const sessions = await authService.listSessions(userId, sessionId);
  sendSuccess(res, sessions, 'Sessions retrieved successfully');
}

export async function revokeSession(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { id } = req.params as { id: string };
  await authService.revokeSession(userId, id);
  sendSuccess(res, null, 'Session revoked successfully');
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const user = await authService.getMe(userId);
  sendSuccess(res, user, 'Profile retrieved successfully');
}
