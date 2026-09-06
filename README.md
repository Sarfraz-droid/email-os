# Gmail OS

A monorepo with:

- **`packages/backend`** — Bun + TypeScript. A Gmail MCP server (stdio transport, for Claude Desktop/Claude Code) exposing search, read, send/reply/forward, labels, drafts, attachments, and bulk thread operations as tools. The same code also runs an HTTP server with Google sign-in, per-user sessions, persisted conversations, and a streaming `/api/chat` endpoint that drives an OpenRouter-backed chat agent using the signed-in user's Gmail.
- **`packages/frontend`** — Bun + React + Vite + Tailwind v4 + shadcn/ui. A chat UI with a "Sign in with Google" gate; once signed in it talks to `/api/chat` over SSE, renders Gmail results as cards, and lists the user's saved conversations.
- **`packages/shared`** — TypeScript types shared between backend and frontend (chat protocol, Gmail result shapes, user + conversation types).

## Multi-user

Each person signs in with Google. One consent grants both identity (OpenID Connect) and Gmail access; their Gmail tokens and chat history live in Postgres/CockroachDB, scoped to their user id. Sessions are server-side (an httpOnly cookie). The stdio MCP server stays single-account — it uses the most recently connected account, or `MCP_ACCOUNT_EMAIL`.

## Setup

```bash
bun install

cp packages/backend/.env.example packages/backend/.env
# fill in:
#   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  — OAuth client, "Web application" type,
#                                              redirect URI http://localhost:8787/oauth/callback,
#                                              consent-screen scopes: openid, email, profile,
#                                              https://mail.google.com/
#   OPENROUTER_API_KEY                       — https://openrouter.ai/keys
#   DATABASE_URL                             — Postgres / CockroachDB connection string
#                                              (CockroachDB Cloud uses ?sslmode=verify-full)
#   APP_BASE_URL                             — frontend origin (http://localhost:5173 in dev)
#   APP_SECRET                               — `openssl rand -base64 48`; encrypts Gmail tokens at rest

cp packages/frontend/.env.example packages/frontend/.env

# create the tables (idempotent; also re-run automatically on server boot)
bun run --filter backend db:migrate
```

## Development

Run backend and frontend in two terminals:

```bash
bun run dev:backend    # http://localhost:8787
bun run dev:frontend   # http://localhost:5173
```

Open the frontend and click **Sign in with Google**. One consent grants sign-in and Gmail access; a session cookie is set and you land back in the app. Gmail tokens refresh automatically. Each signed-in user sees only their own conversations and inbox.

## Using the Gmail MCP server from Claude Desktop / Claude Code

Register the stdio entrypoint in your MCP client config:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/app/packages/backend/src/index.ts", "mcp"]
    }
  }
}
```

The MCP server is single-account. With `DATABASE_URL` set it acts as the most recently connected Gmail account (or the one named by `MCP_ACCOUNT_EMAIL`); without a database it falls back to the legacy `packages/backend/data/token.json`. Sign in through the web app first so an account exists.

## Deployment

Backend on Fly.io, frontend on Vercel — see **[DEPLOYMENT.md](DEPLOYMENT.md)**.
Config lives in `fly.toml`, `packages/backend/Dockerfile`, and `vercel.json`.

## Other commands

```bash
bun run typecheck              # tsc --noEmit across all packages
bun run build                  # build all packages
bun run --filter backend db:migrate   # apply the DB schema
```
