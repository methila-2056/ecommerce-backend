import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    globalTeardown: ['./tests/global-teardown.ts'],
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // One worker at a time: tests share a single MongoDB memory instance and
    // the in-memory rate-limiter store, so files must not interleave.
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    maxConcurrency: 1,
  },
});
