import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { env } from './env.js';
import { logger } from './logger.js';

function sanitizeConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '(invalid url)';
  }
}

// Holds the embedded replica set in demo mode so it can be stopped cleanly on
// shutdown. Never set in normal (DATABASE_URL-backed) operation.
let memoryReplSet: MongoMemoryReplSet | undefined;

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  // serverSelectionTimeoutMS bounds how long we wait for Mongo during startup
  // so a misconfigured DATABASE_URL fails fast instead of hanging forever.
  if (env.USE_IN_MEMORY_DB === 'true') {
    // Demo mode: no external database account needed. The embedded replica set
    // is ephemeral — data resets whenever the process restarts or redeploys.
    memoryReplSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ args: ['--wiredTigerCacheSizeGB', '0.25'] }],
    });
    const uri = `${memoryReplSet.getUri()}?retryWrites=false`;
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
    logger.warn('Connected to embedded in-memory MongoDB (demo mode — data is NOT persistent)');
    return;
  }

  await mongoose.connect(env.DATABASE_URL, {
    serverSelectionTimeoutMS: 10_000,
  });
  logger.info({ database: sanitizeConnectionString(env.DATABASE_URL) }, 'Connected to MongoDB');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  if (memoryReplSet) {
    await memoryReplSet.stop();
    memoryReplSet = undefined;
  }
  logger.info('Disconnected from MongoDB');
}
