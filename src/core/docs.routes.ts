import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { load } from 'js-yaml';
import { logger } from '../config/logger.js';

// Serves the OpenAPI spec (docs/openapi.yaml) through Swagger UI. The spec file
// is resolved relative to this module so it works both under tsx (src) and the
// compiled dist output. Serverless bundlers may not ship the YAML with the
// function, so the route degrades gracefully instead of crashing the app.
let spec: Record<string, unknown> | null = null;
try {
  const specPath = fileURLToPath(new URL('../../docs/openapi.yaml', import.meta.url));
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
