import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Boots a single-node MongoDB replica set before any test file runs.
// A replica set is required because the order/payment flows use multi-document
// transactions (session.withTransaction).
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.PAYMENT_MOCK_AUTO_APPROVE = 'true';

  const instance = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  // retryWrites must be off for the single-node in-memory replset (the driver
  // cannot confirm retryable-write support on this topology). Transactions are
  // unaffected — they use sessions, not retryable writes.
  const uri = instance.getUri();
  process.env.DATABASE_URL = `${uri}${uri.includes('?') ? '&' : '?'}retryWrites=false`;

  (globalThis as Record<string, unknown>).__MONGO_MEMORY_INSTANCE__ = instance;
}
