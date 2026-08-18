// Vercel serverless function for the deployed API.
//
// The backend requires a MongoDB replica set for its transactional checkout
// flow. Vercel serverless cannot host one, so this deployment fronts the live
// Render-hosted origin (see API_ORIGIN below) and terminates CORS at the edge.
// It is a transparent reverse proxy: every path and method is forwarded 1:1,
// including cookies and Set-Cookie headers, and responses stream back.
//
// Uses Node.js runtime (not Edge) to allow longer timeouts for Render cold
// starts, which can take 30-60s on the free tier.
//
// To run the backend natively on Vercel instead (requires a real MongoDB):
//   1. Revert this file to `export default createApp()`.
//   2. Add DATABASE_URL and the JWT/PAYMENT_WEBHOOK secrets as Vercel env vars.
//   3. Point API_ORIGIN away / delete it.
import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_ORIGIN = process.env.API_ORIGIN ?? 'https://ecommerce-backend-aot3.onrender.com';

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// An empty CORS_ORIGIN means "reflect any origin" (public demo API). Otherwise
// the request is accepted only when its Origin is allow-listed.
const isAllowedOrigin = (origin: string | null): boolean =>
  !origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin);

function setCorsHeaders(res: VercelResponse, origin: string | null): void {
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = (req.headers.origin as string | undefined) ?? null;

  if (origin && !isAllowedOrigin(origin)) {
    res.status(403).json({ success: false, message: 'Origin not allowed' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204);
    res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');
    res.end();
    return;
  }

  const target = new URL(req.url!, API_ORIGIN);

  // Build upstream headers, stripping hop-by-hop headers that should not be
  // forwarded.
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === 'host' || key === 'origin') continue;
    if (value === undefined || value === null) continue;
    headers.set(key, Array.isArray(value) ? value[0] : String(value));
  }

  const init: RequestInit = { method: req.method, headers, redirect: 'manual' };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await readBody(req);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    console.error('Upstream request failed:', err);
    res.status(502).json({ success: false, message: 'Bad Gateway — origin unreachable' });
    return;
  }

  // Copy upstream status and headers to the Vercel response.
  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    // Skip headers managed by the runtime / that cause issues when forwarded.
    const skip = new Set(['transfer-encoding', 'connection', 'keep-alive']);
    if (!skip.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  setCorsHeaders(res, origin);

  // Stream the upstream body back to the client. This avoids buffering the
  // entire response in memory, which is important for large payloads.
  if (upstream.body) {
    const reader = upstream.body.getReader();
    const pump = async (): Promise<void> => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    };
    await pump();
  }
  res.end();
}

function readBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
