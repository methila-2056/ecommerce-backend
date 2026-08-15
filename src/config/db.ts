import mongoose from 'mongoose';
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

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  // serverSelectionTimeoutMS bounds how long we wait for Mongo during startup
  // so a misconfigured DATABASE_URL fails fast instead of hanging forever.
  await mongoose.connect(env.DATABASE_URL, {
    serverSelectionTimeoutMS: 10_000,
  });
  logger.info({ database: sanitizeConnectionString(env.DATABASE_URL) }, 'Connected to MongoDB');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('Disconnected from MongoDB');
}
