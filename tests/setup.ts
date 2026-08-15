import { afterAll, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';

// Lifecycle for the shared in-memory database (booted by globalSetup):
//  - connect once per test file (mongoose keeps a singleton connection);
//  - wipe all documents after each test, KEEPING indexes so unique-constraint
//    guarantees (email, coupon code, review/product pair, ...) stay live.
beforeAll(async () => {
  await connectDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

afterEach(async () => {
  const db = mongoose.connection.db;
  if (db) {
    const collections = await db.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  }
});
