# Architecture

High-level overview of how the system is organised. For setup and usage see the
[README](../README.md); for deployment specifics see [DEPLOYMENT.md](DEPLOYMENT.md).

## System overview

```
                ┌────────────────────────────┐
  Clients ────► │  Vercel edge (api/index.ts)│  public URL, reverse proxy
                └─────────────┬──────────────┘
                              │ forwards all requests
                              ▼
                ┌────────────────────────────┐
                │  Render origin (Express)   │  full API + Swagger docs
                └─────────────┬──────────────┘
                              │ Mongoose
                              ▼
                ┌────────────────────────────┐
                │        MongoDB             │
                └────────────────────────────┘
```

- **`api/index.ts`** is a stateless gateway deployed on Vercel. It keeps the stable
  public URL and proxies every request to the Render origin, which runs the real
  Express application.
- **`src/`** contains the complete Node.js backend (also runnable standalone via
  `npm run dev` / `npm start`, or containerised with `Dockerfile` +
  `docker-compose.yml`).
- **`java/`** holds a Java (Spring) companion service with its own CI pipeline
  (`java-ci.yml`) used as an additional gateway/health surface.

## Backend layering (`src/`)

| Layer | Purpose |
| ----- | ------- |
| `core/` | Application bootstrap: Express app factory (`app.ts`), server entrypoint (`server.ts`), global `middleware/` (helmet, CORS, rate limiting, request logging) |
| `modules/` | Feature modules, one directory per domain: `auth`, `user`, `catalog`, `cart`, `order`, `payment`, `coupon`, `inventory`, `review`, `wishlist`, `notification`, `audit`, `admin` |
| `shared/` | Cross-cutting concerns: typed error classes, reusable middleware, utilities |
| `integrations/email/` | Outbound email adapter |
| `config/` | Environment parsing and validation (Zod), Mongo connection setup |
| `types/` | Shared TypeScript type declarations |
| `scripts/` | Operational scripts such as database seeding (`npm run seed`) |

### Module convention

Every module keeps the same internal shape so behaviour is predictable
(`src/modules/auth/` as an example):

```
src/modules/<domain>/
  ├── <domain>.routes.ts      # route definitions wired into the app router
  ├── <domain>.controller.ts  # HTTP layer: validate → delegate → respond
  ├── <domain>.service.ts     # business rules, transactions
  ├── <domain>.validators.ts  # Zod request schemas used by the controller
  └── *.model.ts              # Mongoose schemas/models (e.g. refresh-session.model.ts)
```

Supporting collaborators may live alongside (e.g. `token.service.ts`,
`password.service.ts` in the auth module) rather than forcing everything into one file.

Key design points:

- **Auth**: JWT access tokens plus rotating refresh tokens stored per session;
  passwords hashed with bcrypt.
- **Checkout pipeline**: orders, coupons, payments and inventory are coordinated in
  a MongoDB transaction so stock and payment state never diverge.
- **Payments**: provider-agnostic via the strategy files in
  `payment/payment.providers/`.
- **Admin & audit**: privileged routes are guarded by role middleware; sensitive
  actions append to the audit trail.

## Testing

Integration tests live centrally in `tests/` (one suite per domain: `auth`,
`catalog`, `checkout`, `payments`) and run against a real in-memory MongoDB
replica set (`mongodb-memory-server`) through supertest, exercising the full
HTTP stack — no mocked repositories. Shared fixtures and helpers are in
`tests/helpers.ts`; `global-setup.ts` boots the replica set for the whole run.
The same suite gates every pull request in CI (`ci.yml`), alongside typecheck,
lint, format check and builds for both the API and the storefront frontend.

## Security posture

- Helmet, strict CORS and express-rate-limit applied globally in `core/middleware/`.
- All request payloads validated with Zod schemas at the controller boundary.
- Vulnerability scanning via CodeQL (`codeql.yml`) and dependency updates via
  Dependabot (`dependabot.yml`). See [SECURITY.md](../SECURITY.md) for reporting policy.
