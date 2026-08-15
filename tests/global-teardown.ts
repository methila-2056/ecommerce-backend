import type { MongoMemoryReplSet } from 'mongodb-memory-server';

export default async function globalTeardown(): Promise<void> {
  const instance = (globalThis as Record<string, unknown>).__MONGO_MEMORY_INSTANCE__ as
    MongoMemoryReplSet | undefined;
  await instance?.stop();
}
