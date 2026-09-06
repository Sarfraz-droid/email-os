# Deployment

Backend → **Fly.io** (Bun HTTP server, Docker). Frontend → **Vercel** (Vite static build).
They run on different sites, so the session cookie is issued `SameSite=None; Secure`
and CORS is locked to `APP_BASE_URL`.

```
Browser ──> Vercel  (frontend, https://<frontend>.vercel.app)
          │  VITE_BACKEND_URL points here ↓
          └> Fly.io  (backend,  https://<backend>.fly.dev)  ──> CockroachDB/Postgres
                                                             ──> Google OAuth
                                                             ──> OpenRouter
```

Pick the two hostnames up front — each side needs the other's URL:

- `BACKEND_URL`  = `https://<backend>.fly.dev`
- `FRONTEND_URL` = `https://<frontend>.vercel.app`

---

## 1. Provision a database

Any Postgres works; CockroachDB Cloud (Serverless free tier) is what the code is
tuned for. Create a cluster, then grab its `postgresql://…?sslmode=verify-full`
connection string. Managed clusters present a publicly-trusted cert, so no CA
file is needed (otherwise set `DATABASE_CA_CERT`).

The schema is applied automatically — on every boot and as the Fly
`release_command` — so there is no manual migration step.

## 2. Google OAuth client

In Google Cloud Console → *APIs & Services → Credentials*, edit (or create) the
**Web application** OAuth client:

- **Authorized redirect URI:** `https://<backend>.fly.dev/oauth/callback`
- OAuth consent screen scopes: `openid`, `email`, `profile`, `https://mail.google.com/`

Keep the `http://localhost:8787/oauth/callback` entry too for local dev.

## 3. Backend on Fly.io

From the repo root (`fly.toml` and `packages/backend/Dockerfile` are already here):

```bash
fly launch --no-deploy          # accept the detected fly.toml; pick an app name + region
                                # -> update `app` / `primary_region` in fly.toml if you renamed
```

Set secrets (everything sensitive; non-secret config already lives in `fly.toml [env]`):

```bash
fly secrets set \
  GOOGLE_CLIENT_ID="…" \
  GOOGLE_CLIENT_SECRET="…" \
  GOOGLE_REDIRECT_URI="https://<backend>.fly.dev/oauth/callback" \
  OPENROUTER_API_KEY="…" \
  DATABASE_URL="postgresql://…?sslmode=verify-full" \
  APP_SECRET="$(openssl rand -base64 48)" \
  APP_BASE_URL="https://<frontend>.vercel.app"
```

`APP_BASE_URL` drives three things: the post-login redirect target, the CORS
allow-origin, and (because it is `https://`) the `Secure` + `SameSite=None`
cookie flags. It must be the exact Vercel origin, no trailing slash.

Deploy:

```bash
fly deploy      # remote builder; runs the release_command (migrate) then rolls out
fly logs        # watch boot — expect "Gmail OS backend listening on …"
curl https://<backend>.fly.dev/health   # {"ok":true,"authenticated":false,...}
```

`OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`, `SESSION_TTL_DAYS`, `PORT` are set in
`fly.toml`; override any of them with `fly secrets set` if needed (secrets win).

## 4. Frontend on Vercel

`vercel.json` at the repo root already defines the monorepo build (Bun install at
root, `--filter frontend build`, output `packages/frontend/dist`, SPA rewrite).

New project → import the repo:

- **Root Directory:** repo root (leave as `.`). Do **not** set it to
  `packages/frontend` — the `@email-os/shared` workspace resolves from the root.
- Framework preset: **Vite** (or "Other"; `vercel.json` overrides the commands).
- **Environment Variable:** `VITE_BACKEND_URL = https://<backend>.fly.dev`
  (Production + Preview). It is read at build time, so redeploy after changing it.

Deploy. Then, if the Vercel URL wasn't known when you set the Fly secrets, update
them now so the two sides agree:

```bash
fly secrets set APP_BASE_URL="https://<frontend>.vercel.app"   # triggers a redeploy
```

## 5. Smoke test

1. Open `https://<frontend>.vercel.app` → **Sign in with Google**.
2. Consent → you land back in the app signed in (a `__Host-emailos_session`
   cookie is set on the `.fly.dev` domain).
3. Send a chat message; Gmail result cards render.

### Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Redirected to Google then `redirect_uri_mismatch` | `GOOGLE_REDIRECT_URI` secret ≠ the URI registered in Google Console. |
| Signed in on `/oauth/callback` but the app still shows the login gate | Cross-site cookie blocked. Check `APP_BASE_URL` is the exact `https://` Vercel origin, and that the browser isn't blocking third-party cookies for this pair. |
| `/api/*` calls fail CORS | `APP_BASE_URL` must equal the frontend origin exactly (scheme + host, no trailing slash). |
| Frontend calls `http://localhost:8787` in prod | `VITE_BACKEND_URL` not set at build time — set it in Vercel and redeploy. |
| Release fails on `migrate` | `DATABASE_URL` unreachable from Fly / wrong `sslmode`. Test with `fly ssh console -C "bun run src/index.ts migrate"`. |

## Local development

Unchanged — see `README.md`. `http://localhost` keeps the cookie on
`SameSite=Lax` and CORS on `http://localhost:5173`.
