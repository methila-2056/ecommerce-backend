import type { Socket } from 'node:net';
import { createApp } from './app.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { startBackgroundJobs } from '../modules/notification/notification.worker.js';
import { seedDemoData } from '../scripts/seed-data.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function startServer(): Promise<void> {
  const app = createApp();

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info({ host: env.HOST, port: env.PORT }, 'HTTP server listening');
  });

  // Background jobs (low-stock alerts, ...). Skipped in test so timers don't
  // keep the process alive after the suite finishes.
  let jobsTimer: NodeJS.Timeout | undefined;
  if (env.NODE_ENV !== 'test') {
    jobsTimer = startBackgroundJobs();
  }

  // Track live sockets so a stalled keep-alive connection can be force-closed
  // during shutdown instead of blocking it indefinitely.
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  server.on('error', (err) => {
    logger.fatal({ err }, 'HTTP server error');
    process.exit(1);
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received, draining connections');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      if (jobsTimer) clearInterval(jobsTimer);
      for (const socket of sockets) socket.destroy();
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    // Stop accepting new connections, let in-flight requests finish, then
    // close the database before the process exits.
    server.close((closeErr) => {
      clearTimeout(forceExit);
      if (jobsTimer) clearInterval(jobsTimer);
      void (async () => {
        try {
          await disconnectDatabase();
          logger.info('Shutdown complete');
          process.exit(closeErr ? 1 : 0);
        } catch (err) {
          logger.error({ err }, 'Error during database disconnect');
          process.exit(1);
        }
      })();
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Crash fast on programmer errors so the process supervisor restarts the
  // service into a clean state.
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
}

connectDatabase()
  .then(async () => {
    // Demo mode uses an ephemeral in-memory database, so reseed on every
    // boot (mirrors the live demo). Never touches DATABASE_URL-backed data.
    if (env.USE_IN_MEMORY_DB === 'true') {
      await seedDemoData();
    }
  })
  .then(startServer)
  .catch((err: unknown) => {
    logger.fatal({ err }, 'Failed to connect to database');
    process.exit(1);
  });
