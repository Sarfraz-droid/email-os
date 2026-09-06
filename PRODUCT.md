# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: the developer who runs Gmail OS and a small circle of technical
friends who use the same instance. Each person signs in with their own Google
account and gets their own Gmail connection and their own chat history; users
never see each other's conversations or inbox. The user is at a desktop,
mid-task in their own inbox, and trusts the running process with full mailbox
access. The instance is still operated by someone the users know — not a public
sign-up product — but it is now genuinely multi-account and can be deployed for
a group rather than only run on one laptop.

## Product Purpose

Gmail OS turns a Gmail inbox into something you talk to. Instead of clicking
through Gmail's UI, the user asks in plain language — "find my Swiggy internship
certificate", "list my HDFC UPI transactions from the last 30 days", "archive
every promo older than a month" — and an LLM agent runs real Gmail operations to
answer or act. Success is the user getting a correct, specific answer (or a
completed triage action) in one sentence of typing, without opening Gmail.

## Positioning

Two things a neighboring tool cannot truthfully copy at once:

1. **One Gmail toolset, two surfaces.** The same search / read / label / send /
   bulk-thread operations power both this local chat UI and an MCP server for
   Claude Desktop and Claude Code. Connect Gmail once via OAuth; both surfaces
   share the token.
2. **Private by construction.** Email bodies are never stored by the app — they
   leave the running process only for the LLM API call. What the app does keep
   is scoped per user: Gmail OAuth tokens (encrypted at rest when `APP_SECRET`
   is set) and chat transcripts, in a database the operator controls.

Against Gmail's own search, the difference is natural-language bulk triage and
cross-message answers: questions and actions that span many messages at once,
which Gmail's UI makes tedious or impossible.

## Operating Context

- Runs as two processes: a Bun backend (`http://localhost:8787` in dev) and a
  Vite frontend (`http://localhost:5173`). Backend also runs as a stdio MCP
  server for MCP clients, and as a `migrate` mode that applies the DB schema.
- The frontend is gated by a **Sign in with Google** screen. One OAuth consent
  requests `openid email profile https://mail.google.com/`, so it establishes
  identity and grants Gmail access together. The callback upserts the user,
  stores their Gmail tokens, creates a server-side session, and sets an
  httpOnly cookie. Gmail tokens refresh automatically.
- Requires a Google OAuth client (Web application type), an OpenRouter API key,
  a `DATABASE_URL` (Postgres wire protocol; CockroachDB Cloud is what the
  operator uses), `APP_BASE_URL` (frontend origin), and `APP_SECRET` (token
  encryption) — all in `packages/backend/.env`. Model is configurable
  (`OPENROUTER_MODEL`, default `anthropic/claude-sonnet-5`).
- Conversations are persisted per user in the database. Each turn's raw agent
  messages (text, tool calls, tool results) are stored and rebuilt into the UI
  transcript on load; the sidebar lists the user's conversations.
- The agent loop is capped at 8 tool iterations per user turn and streams
  results to the UI over SSE (text deltas, tool calls, tool results, errors,
  plus a `conversation` event when a new thread is created).
- The stdio MCP server stays single-account: with `DATABASE_URL` set it acts as
  the most recently connected account (or `MCP_ACCOUNT_EMAIL`); otherwise it
  falls back to the legacy `data/token.json`.

## Capabilities and Constraints

**First-class (never hidden or de-emphasized):**

- **Read & search** — `search_messages`, `search_threads`, `get_message`,
  `get_thread`, `list_labels`, `list_drafts`. The safe, no-side-effect core and
  the main reason the product exists.
- **Attachments** — fetching attachment content (`get_attachment`), e.g.
  retrieving a certificate PDF or a receipt.

**Supported but secondary — must sit behind an explicit confirmation:**

- **Mailbox state changes** — archive, trash/untrash, mark read/unread,
  mark/unmark spam, apply/remove labels, create/rename/delete labels, and bulk
  thread operations (`batch_modify_messages`, `batch_archive_messages`,
  `batch_trash_messages`).
- **Write actions** — send, reply, forward, and draft create/update/send.

**Constraints future work must preserve:**

- Any state-changing action (send, reply, forward, trash, archive, label,
  spam, bulk anything) must be explicitly confirmed by the user in the UI
  before it executes. The agent may propose; the user commits.
- The agent must never invent message content, senders, dates, or ids — every
  claim about the inbox comes from a real tool result.
- Per-user isolation: every conversation, Gmail token, and inbox operation is
  scoped to the signed-in user's id. No route returns another user's data.
- Email bodies and attachments are never persisted server-side — only OAuth
  tokens (encrypted at rest) and chat transcripts.

**Explicitly undecided:** saved/named searches, whether write actions ever get
their own composer surface vs. staying chat-only, whether the instance ever
becomes an open sign-up product (it is operator-run today).

## Brand Commitments

- Name: **Gmail OS** (styled `Gmail` + muted `OS` in the current header).
- Voice: concise and factual. The assistant states what it found or did in as
  few words as possible and does not editorialize.
- Committed visual world: a dark, "futuristic" theme — near-black blue-tinted
  ground with an ambient violet/cyan aura, glass surfaces, an indigo→violet
  accent, and an animated gradient "orb" mark. Dark is the primary and default
  look. A future light theme is acceptable but not required; do not make
  choices that structurally rule one out (keep semantic color tokens, avoid
  hard-coded dark-only values where a token would do).

## Evidence on Hand

- `README.md` — architecture, setup, MCP registration.
- Working local install with a connected Gmail account and real message data
  (used for the screenshots that drove the current UI: transaction summaries,
  the Swiggy internship certificate lookup, reply-triage).
- Shared chat protocol and Gmail result shapes in `packages/shared/src/types.ts`
  (`ToolResultPayload`: `messages | message | threads | thread | labels | ack |
  raw`; plus `User`, `ConversationSummary`, `UiChatMessage`).
- Auth + persistence: `packages/backend/src/db/` (schema, repos, token
  encryption), `src/auth/` (Google OIDC, sessions), `src/lib/auth.tsx` on the
  frontend.
- Agent system prompt in `packages/backend/src/agent/chat-loop.ts`.
- No testimonials, usage metrics, customer names, or benchmarks exist. Future
  work must not fabricate any.

## Product Principles

1. **The answer is the product; the email list is evidence.** Lead with the
   agent's plain-language response. Raw messages, threads, and payloads are
   supporting detail the user can expand into — never the default wall of cards.
2. **Reads are frictionless; writes are deliberate.** Search and questions
   happen instantly on one line of typing. Anything that changes the mailbox
   stops for an explicit, legible confirmation.
3. **Grounded, never fabricated.** Every statement about the inbox traces to a
   real Gmail tool result. When the tools return nothing, say so.
4. **Private is a feature, not a footnote.** The UI should make it obvious that
   the user's mail is never stored by the app and each user's data is their
   own — only tokens and chat text are kept, scoped per user.
5. **One toolset, two surfaces.** Changes to Gmail capabilities should keep the
   web UI and the MCP server at parity rather than favoring one.

## Accessibility & Inclusion

No user-specific accessibility requirement was established. Hold to standard
practice: WCAG AA contrast (verify the dark palette's muted-foreground and
accent text against their grounds), full keyboard operation of the composer and
every expand/confirm control, visible focus states, and respect for
`prefers-reduced-motion` on the ambient/orb animations.
