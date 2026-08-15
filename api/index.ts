// Vercel edge gateway for the deployed API.
//
// The backend requires a MongoDB replica set for its transactional checkout
// flow. Vercel serverless cannot host one, so this deployment fronts the live
// Render-hosted origin (see API_ORIGIN below) and terminates CORS at the edge.
// It is a transparent reverse proxy: every path and method is forwarded 1:1,
// including cookies and Set-Cookie headers, and responses stream back.
//
// To run the backend natively on Vercel instead (requires a real MongoDB):
//   1. Revert this file to `export default createApp()`.
//   2. Add DATABASE_URL and the JWT/PAYMENT_WEBHOOK secrets as Vercel env vars.
//   3. Point API_ORIGIN away / delete it.
const API_ORIGIN = process.env.API_ORIGIN ?? 'https://ecommerce-backend-aot3.onrender.com';

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// An empty CORS_ORIGIN means "reflect any origin" (public demo API). Otherwise
// the request is accepted only when its Origin is allow-listed.
const isAllowedOrigin = (origin: string | null): boolean =>
  !origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin);

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');

  if (origin && !isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ success: false, message: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin ?? '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }

  const url = new URL(req.url);
  const target = new URL(url.pathname + url.search, API_ORIGIN);

  // Forward the request to the origin. CORS is terminated at this edge, so the
  // Origin header is not passed upstream (the origin's own allow-list only knows
  // its own URL).
  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('origin');

  const init: RequestInit = { method: req.method, headers, redirect: 'manual' };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(target, init);

  const responseHeaders = new Headers(upstream.headers);
  if (origin && isAllowedOrigin(origin)) {
    responseHeaders.set('Access-Control-Allow-Origin', origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Vary', 'Origin');
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
