import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { createApp } from '../src/core/app.js';

// Module-level cache: persists across warm invocations in serverless.
let app: ReturnType<typeof createApp> | undefined;

async function ensureDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(process.env.DATABASE_URL!, {
    serverSelectionTimeoutMS: 10_000,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!app) {
    await ensureDatabase();
    app = createApp();
  }
  return app(req, res);
}
