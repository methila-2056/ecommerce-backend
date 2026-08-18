import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { load } from 'js-yaml';
import { logger } from '../config/logger.js';

// Serves the OpenAPI spec (docs/openapi.yaml) through Swagger UI. The spec file
// is resolved from the project root (process.cwd()) so it works in both local
// development and serverless environments (Vercel, Render, etc.).
let spec: Record<string, unknown> | null = null;
try {
  const specPath = resolve(process.cwd(), 'docs', 'openapi.yaml');
  spec = load(readFileSync(specPath, 'utf8')) as Record<string, unknown>;
} catch (err) {
  logger.warn({ err }, 'OpenAPI spec not available — API docs will be disabled');
}

const router = Router();

if (spec) {
  router.use('/docs', swaggerUi.serve);
  router.get(
    '/docs',
    swaggerUi.setup(spec, {
      customSiteTitle: 'E-Commerce Backend System — API Reference',
      swaggerOptions: { persistAuthorization: true },
    }),
  );
} else {
  router.get('/docs', (_req, res) => {
    res.status(503).json({
      success: false,
      message: 'API documentation is not available in this deployment environment',
    });
  });
}

export default router;
