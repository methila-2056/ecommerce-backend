import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from './env.js';

// Structured JSON logging (Pino). Redaction prevents credentials and other
// sensitive fields from ever reaching logs — a hard requirement of this
// project. In production a raw JSON stream is emitted for log drainers;
// in development a human-readable transport is used.
export const logger = pino({
  name: 'ecommerce-api',
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.confirmPassword',
      'req.body.oldPassword',
      'req.body.newPassword',
      'req.body.token',
      'req.body.refreshToken',
      'req.body.accessToken',
      '*.password',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        },
      }
    : {}),
});

// HTTP request logger. Each request gets a correlation ID that is echoed in
// the X-Request-Id response header and attached to every log line produced
// while handling that request, which is essential for debugging production.
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    if (typeof existing === 'string' && existing.length > 0) {
      res.setHeader('X-Request-Id', existing);
      return existing;
    }
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  // Health checks run constantly by the orchestrator; exclude them to keep
  // logs actionable.
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/ready',
  },
});
