import 'dotenv/config';
import { z } from 'zod';

// Environment is validated at startup so the process fails fast on a
// misconfigured deployment instead of failing at request time. Parsing never
// logs secret values — invalid secrets are reported as error codes only.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Persistent MongoDB replica-set URI (transactions require a replica set).
  // When USE_IN_MEMORY_DB=true, DATABASE_URL is not required and the app boots
  // an embedded in-memory replica set instead (demo mode — data is ephemeral).
  DATABASE_URL: z.string().default(''),
  USE_IN_MEMORY_DB: z.enum(['true', 'false']).default('false'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Base URL of the frontend, used to build email verification / password
  // reset links. Emails are dev-only until the notifications phase.
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  // Secrets below are required by the auth module (Phase 2) but validated from
  // the very first run so a missing secret is caught immediately. Test runs
  // (npm test / CI) use built-in throwaway defaults so a fresh clone with no
  // .env file can run the suite out of the box.
  JWT_ACCESS_SECRET:
    process.env.NODE_ENV === 'test'
      ? z.string().default('test-only-access-secret-0123456789abcdef0123456789abcdef')
      : z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET:
    process.env.NODE_ENV === 'test'
      ? z.string().default('test-only-refresh-secret-0123456789abcdef0123456789abcdef')
      : z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),

  // Account lockout: consecutive failed logins lock the account for
  // ACCOUNT_LOCK_MINUTES. Guards against brute-force/credential-stuffing.
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  ACCOUNT_LOCK_MINUTES: z.coerce.number().int().positive().default(15),

  // Token lifetimes for email verification and password reset.
  EMAIL_VERIFICATION_TOKEN_TTL: z.string().default('24h'),
  PASSWORD_RESET_TOKEN_TTL: z.string().default('15m'),

  // httpOnly refresh cookie settings.
  REFRESH_COOKIE_NAME: z.string().default('rt'),
  REFRESH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // Shipping policy: flat fee per order, waived above a subtotal threshold.
  // Set both to 0 for free shipping.
  SHIPPING_FLAT_CENTS: z.coerce.number().int().min(0).default(0),
  FREE_SHIPPING_THRESHOLD_CENTS: z.coerce.number().int().min(0).default(0),

  // Payment provider. 'mock' is the default offline provider used in dev/test;
  // production deployments swap in a real implementation via the registry.
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  // Shared secret used to HMAC-sign provider webhook payloads. Never ship the
  // production value to the client.
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('dev-webhook-secret-change-me'),
  // When true (dev/test), the mock provider marks payments succeeded at
  // checkout so the happy path can be exercised without a webhook round-trip.
  PAYMENT_MOCK_AUTO_APPROVE: z.enum(['true', 'false']).default('true'),
  // Production guard: a real store must never auto-approve payments. A
  // portfolio/demo deployment may opt in explicitly by ALSO setting this true.
  ALLOW_MOCK_AUTO_APPROVE_IN_PRODUCTION: z.enum(['true', 'false']).default('false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    'Invalid environment configuration:',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

const env = parsed.data;

// DATABASE_URL is only optional when the embedded in-memory demo database is
// enabled. Keep the original fast-fail behaviour otherwise.
if (env.USE_IN_MEMORY_DB !== 'true' && env.DATABASE_URL === '') {
  console.error(
    'Invalid environment configuration: DATABASE_URL is required (or set USE_IN_MEMORY_DB=true for the demo database)',
  );
  process.exit(1);
}

// Refuse to boot in production with placeholder secrets. The exact values that
// ship in .env.example (and this repo) are public knowledge, so a deployment
// that forgets to rotate them is trivially compromised.
const PLACEHOLDER_SECRETS = new Set([
  'change-me-to-a-random-64-char-hex-string',
  'dev-webhook-secret-change-me',
  'local-dev-access-secret-change-me',
  'local-dev-refresh-secret-change-me',
  'local-dev-webhook-secret',
]);

if (
  env.NODE_ENV === 'production' &&
  ([env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET, env.PAYMENT_WEBHOOK_SECRET].some((secret) =>
    PLACEHOLDER_SECRETS.has(secret),
  ) ||
    (env.PAYMENT_MOCK_AUTO_APPROVE === 'true' &&
      env.ALLOW_MOCK_AUTO_APPROVE_IN_PRODUCTION !== 'true'))
) {
  console.error(
    'Refusing to start in production: rotate JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and ' +
      'PAYMENT_WEBHOOK_SECRET (placeholder values are rejected), and set ' +
      'PAYMENT_MOCK_AUTO_APPROVE=false so payments are not silently auto-approved ' +
      '(or set ALLOW_MOCK_AUTO_APPROVE_IN_PRODUCTION=true to explicitly opt in for a demo).',
  );
  process.exit(1);
}

export { env };

export const corsOrigins: string[] = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
