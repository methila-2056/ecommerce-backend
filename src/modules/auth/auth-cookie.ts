import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { ttlToMs } from '../../shared/utils/ttl.js';

export interface RefreshCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge: number;
}

// The refresh token is returned in the body (so any client — mobile, CLI —
// can use it) and additionally mirrored into an httpOnly cookie so browser
// frontends get a first line of defense against XSS stealing it.
export function refreshCookieOptions(): RefreshCookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.REFRESH_COOKIE_SAME_SITE,
    path: '/api/v1/auth',
    maxAge: ttlToMs(env.REFRESH_TOKEN_TTL),
  };
}

export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.REFRESH_COOKIE_NAME, {
    path: '/api/v1/auth',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
  });
}

export function getRefreshToken(req: Request): string | undefined {
  const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  if (fromBody) return fromBody;
  return (req.cookies as Record<string, string | undefined> | undefined)?.[env.REFRESH_COOKIE_NAME];
}
