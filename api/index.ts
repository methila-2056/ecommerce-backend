import type { VercelRequest, VercelResponse } from '@vercel/node';

// Vercel edge gateway — proxies all requests to the Render origin.
// The Render service runs either the Node.js/Express app or the Java/Spring
// Boot drop-in replacement. This keeps the public Vercel URL stable while
// the origin handles the actual business logic and database.
const ORIGIN = process.env.RENDER_ORIGIN_URL ?? 'https://ecommerce-backend-aot3.onrender.com';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `https://${req.headers.host}`);
  const originUrl = `${ORIGIN}${url.pathname}${url.search}`;

  // Build upstream headers — forward the original method, content-type and
  // authorization so the origin can authenticate / authorise the request.
  const headers: Record<string, string> = {};
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'] as string;
  if (req.headers.authorization) headers['authorization'] = req.headers.authorization as string;
  if (req.headers.cookie) headers['cookie'] = req.headers.cookie as string;
  headers['x-forwarded-for'] =
    (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? '';
  headers['x-vercel-ip-country'] = (req.headers['x-vercel-ip-country'] as string) ?? '';

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  // Forward the body for non-GET/HEAD requests.
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(originUrl, init);

    // Copy status + relevant headers back to the client.
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      // Skip hop-by-hop headers that shouldn't be forwarded.
      if (lower === 'transfer-encoding' || lower === 'connection') return;
      res.setHeader(key, value);
    });

    const body = await upstream.text();
    res.send(body);
  } catch (err) {
    res.status(502).json({
      success: false,
      message: 'Origin server is unreachable',
      code: 'BAD_GATEWAY',
      details: { origin: ORIGIN, error: String(err) },
    });
  }
}
