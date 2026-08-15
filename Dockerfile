# syntax=docker/dockerfile:1

# ---- Dependencies ---------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build -----------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- Runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Run as an unprivileged user (no root inside the container).
RUN useradd --create-home --uid 10001 appuser

COPY --chown=appuser:appuser --from=build /app/dist ./dist
COPY --chown=appuser:appuser --from=build /app/node_modules ./node_modules
COPY --chown=appuser:appuser package.json ./
COPY --chown=appuser:appuser docs ./docs

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/core/server.js"]
