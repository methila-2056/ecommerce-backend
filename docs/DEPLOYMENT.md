# Deployment

This API is platform-agnostic. It needs three things in production:

1. A Node.js runtime (20+) running the compiled output (`npm run build` → `node dist/core/server.js`).
2. A **MongoDB replica set** — multi-document transactions are used for checkout, so a standalone
   mongod (or a free Atlas M0) is **not** enough. Use Atlas M10+, or self-host with `--replSet rs0`.
3. `NODE_ENV=production` so the app trusts one reverse-proxy hop (correct client IPs for rate
   limiting and secure cookies) and enforces the CORS allow-list.

## Render

`render.yaml` is a Blueprint that provisions the web service:

```bash
render blueprint launch
```

After the first deploy, set the secrets in the dashboard:

| Variable                  | Value                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`            | `mongodb+srv://<user>:<pass>@<cluster>/ecommerce?replicaSet=<rs>` |
| `JWT_ACCESS_SECRET`       | `openssl rand -hex 48`                                           |
| `JWT_REFRESH_SECRET`      | `openssl rand -hex 48`                                           |
| `PAYMENT_WEBHOOK_SECRET`  | `openssl rand -hex 32`                                           |
| `CORS_ORIGIN` / `FRONTEND_URL` | Your real frontend origin                                    |

> **Zero-dependency demo mode**: the Blueprint sets `USE_IN_MEMORY_DB=true`, so the service boots
> an embedded in-memory MongoDB replica set and needs **no** external database account. This is
> great for a free-tier demo but the data is ephemeral — it resets on every redeploy. To persist,
> set `USE_IN_MEMORY_DB=false` and provide `DATABASE_URL` (Atlas M10+ or any replica set).

The health check runs against `/health`; `/ready` reports database readiness (`503` until Mongo is
reachable).

### Current live demo

The project is deployed for a free-tier portfolio demo (data is ephemeral in both cases):

| Platform | URL | Notes |
| -------- | --- | ----- |
| Render (origin) | `https://ecommerce-backend-aot3.onrender.com` | Runs the app with `USE_IN_MEMORY_DB=true` |
| Vercel (gateway) | `https://ecommerce-backend-ten-zeta.vercel.app` | Edge function proxying the Render origin |

## Vercel

Vercel serverless cannot host the MongoDB replica set the transactional checkout flow requires, so
the Vercel deployment is a lightweight **edge gateway** (`api/index.ts`) that forwards every request
1:1 to the Render origin (`API_ORIGIN` env var) and terminates CORS at the edge. A GitHub Actions
schedule (`.github/workflows/keep-alive.yml`) pings the origin every 5 minutes so it never sleeps.

Required env vars (set in the Vercel dashboard / `vercel env add`):

| Variable       | Value                                   |
| -------------- | --------------------------------------- |
| `API_ORIGIN`   | `https://ecommerce-backend-aot3.onrender.com` |
| `CORS_ORIGIN`  | Comma-separated browser origins (empty = reflect any) |

> **Native Vercel deployment**: if you want the app itself to run on Vercel instead of a gateway,
> you need a real MongoDB replica set (e.g. Atlas M10+). Then revert `api/index.ts` to
> `export default createApp()`, add `DATABASE_URL` plus the JWT/webhook secrets, and remove
> `API_ORIGIN`.

## Docker

```bash
docker compose up --build api     # full stack: mongo (replica set) + API
```

The container runs as an unprivileged user and listens on `3001`.

## Environment checklist

- [ ] `NODE_ENV=production`, `HOST=0.0.0.0`
- [ ] Fresh JWT and webhook secrets (never the `.env.example` placeholders)
- [ ] `DATABASE_URL` points at a **replica set**
- [ ] TLS terminated at the proxy; `trust proxy` enabled (automatic in production)
- [ ] `CORS_ORIGIN` and `FRONTEND_URL` set to real origins
- [ ] For real gateways: set `PAYMENT_PROVIDER`, register the webhook URL
      `https://<host>/api/v1/payments/webhook/<provider>` and disable `PAYMENT_MOCK_AUTO_APPROVE`
