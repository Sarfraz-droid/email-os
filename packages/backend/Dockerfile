# Gmail OS backend — Bun HTTP server for Fly.io.
# Build context is the repo root (see fly.toml `dockerfile` key), because the
# backend depends on the `@email-os/shared` workspace and the root lockfile.

FROM oven/bun:1.3.9-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# --- deps -------------------------------------------------------------------
# Copy just the manifests first so `bun install` is cached across source edits.
# Every workspace package.json is needed for the workspace:* protocol to resolve.
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared/package.json   packages/shared/package.json
COPY packages/backend/package.json  packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN bun install --frozen-lockfile --production

# --- source ---------------------------------------------------------------
COPY packages/shared  packages/shared
COPY packages/backend packages/backend

ENV PORT=8080
EXPOSE 8080

WORKDIR /app/packages/backend
# Bun runs the TypeScript entrypoint directly; `serve` starts the HTTP server
# (which also applies the idempotent DB schema on boot).
CMD ["bun", "run", "src/index.ts", "serve"]
