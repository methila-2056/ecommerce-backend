import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../shared/errors/AppError.js';

// The default keyGenerator uses req.ip, which respects the `trust proxy`
// setting configured on the app in production, so the correct client IP is
// rate-limited behind a reverse proxy.

export interface RateLimiterConfig {
  windowMs: number;
  limit: number;
  message: string;
  code: string;
  skipSuccessRequests?: boolean;
}

// Each rate limiter is created per route so limits can differ per endpoint
// (login gets a tighter budget than, say, a public product list).
export function createRateLimiter(config: RateLimiterConfig): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: config.windowMs,
    limit: config.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: config.skipSuccessRequests ?? false,
    handler: (_req, _res, next) => {
      next(AppError.tooManyRequests(config.message, { errorCode: config.code }));
    },
  });
}
