-- Gmail OS schema. Idempotent: safe to run on every boot.

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub    STRING NOT NULL UNIQUE,
  email         STRING NOT NULL,
  name          STRING,
  picture       STRING,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gmail_accounts (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email         STRING NOT NULL,
  access_token  STRING NOT NULL,
  refresh_token STRING NOT NULL,
  expiry_date   INT8 NOT NULL,
  scope         STRING,
  token_type    STRING,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         STRING PRIMARY KEY,           -- sha256(cookie token), hex
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent STRING
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      STRING NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
  ON conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq             INT8 NOT NULL,
  role            STRING NOT NULL,        -- system | user | assistant | tool
  content         JSONB NOT NULL,         -- raw OpenAI ChatCompletionMessageParam
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq)
);

-- Generative dashboards ------------------------------------------------------

CREATE TABLE IF NOT EXISTS dashboards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             STRING NOT NULL DEFAULT 'Dashboard',
  spec              JSONB NOT NULL,        -- DashboardSpec (shared/src/dashboard.ts)
  -- Gmail message ids already fed through extraction, so a refresh only
  -- processes the delta. Capped in app code; JSONB array of strings.
  seen_message_ids  JSONB NOT NULL DEFAULT '[]',
  -- RefreshState (shared/src/dashboard.ts): background pipeline progress.
  refresh_state     JSONB NOT NULL DEFAULT '{"status":"idle"}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refreshed_at TIMESTAMPTZ
);

-- Backfill for databases created before refresh_state existed.
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS refresh_state JSONB NOT NULL DEFAULT '{"status":"idle"}';

CREATE INDEX IF NOT EXISTS dashboards_user_updated_idx
  ON dashboards (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_rows (
  dashboard_id      UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  entity_key        STRING NOT NULL,      -- DashboardRow.key
  data              JSONB NOT NULL,       -- DashboardRow (fields + sources + lastMessageDate)
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dashboard_id, entity_key)
);
