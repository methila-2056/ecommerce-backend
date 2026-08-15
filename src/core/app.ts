import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { corsOrigins, env } from '../config/env.js';
import { httpLogger } from '../config/logger.js';
import rootRouter from './routes.js';
import apiV1Router from './api-v1.routes.js';
import { errorHandler } from '../shared/errors/error-handler.js';
import { notFoundHandler } from '../shared/errors/not-found.js';
import { webhookHandler } from '../modules/payment/payment.webhook.js';

// Assembles the Express application. Kept as a factory so tests can build an
// isolated app instance per test file (no shared global state).
export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  if (env.NODE_ENV === 'production') {
    // Trust the first reverse-proxy hop so Express derives the real client IP
    // from X-Forwarded-For. Required for correct rate limiting and secure
    // cookies. Deliberately not enabled outside production to prevent
    // client-controlled IP spoofing in development.
    app.set('trust proxy', 1);
  }

  // Security headers (HSTS, X-Content-Type-Options, CSP, etc.).
  app.use(helmet());

  app.use(
    cors({
      // Production uses an explicit allow-list; development stays permissive
      // so a local frontend (e.g. Vite on :5173) can call the API.
      origin: env.NODE_ENV === 'production' ? corsOrigins : true,
      credentials: true,
    }),
  );

  // Webhook handlers must read the raw body to verify the HMAC signature, so
  // they are mounted before the global JSON parser consumes the stream. The
  // body is left as a Buffer for payment.webhookHandler to verify.
  app.use(
    '/api/v1/payments/webhook/:provider',
    express.raw({ type: '*/*', limit: '1mb' }),
    webhookHandler,
  );

  // Request size cap defends against oversized payload attacks.
  app.use(express.json({ limit: '1mb' }));

  // Parses cookies so the refresh token can be read from the httpOnly cookie.
  app.use(cookieParser());

  app.use(httpLogger);

  app.use('/', rootRouter);

  // Versioned module routers (auth, products, orders, ...) mount here.
  app.use('/api/v1', apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
