import { Router } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { sendSuccess } from '../shared/utils/response.js';

const router = Router();

router.get('/', (_req, res) => {
  sendSuccess(res, {
    service: 'E-Commerce Backend System',
    version: '1.0.0',
    environment: env.NODE_ENV,
    endpoints: { docs: '/api/v1/docs', health: '/health', ready: '/ready' },
  });
});

// Liveness probe: the process is up and responding.
router.get('/health', (_req, res) => {
  sendSuccess(
    res,
    { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() },
    'Service is healthy',
  );
});

// Readiness probe: the service is ready to serve traffic only when its
// dependencies (database) are reachable. Orchestrators route traffic /
// restart pods based on this.
router.get('/ready', (_req, res) => {
  const databaseUp = mongoose.connection.readyState === 1;
  res.status(databaseUp ? 200 : 503).json({
    success: databaseUp,
    status: databaseUp ? 'ready' : 'not_ready',
    checks: { database: databaseUp ? 'up' : 'down' },
  });
});

export default router;
