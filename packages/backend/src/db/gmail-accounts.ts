import { db } from "./client.js";
import { decryptSecret, encryptSecret } from "./crypto.js";
import type { StoredTokens } from "../auth/oauth.js";

export interface GmailAccount extends StoredTokens {
  userId: string;
  email: string;
}

interface Row {
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  expiry_date: string; // INT8 comes back as string from the driver
  scope: string | null;
  token_type: string | null;
}

function fromRow(r: Row): GmailAccount {
  return {
    userId: r.user_id,
    email: r.email,
    access_token: decryptSecret(r.access_token),
    refresh_token: decryptSecret(r.refresh_token),
    expiry_date: Number(r.expiry_date),
    scope: r.scope ?? undefined,
    token_type: r.token_type ?? undefined,
  };
}

export async function upsertGmailAccount(
  userId: string,
  email: string,
  tokens: StoredTokens
): Promise<void> {
  await db()`
    INSERT INTO gmail_accounts (user_id, email, access_token, refresh_token, expiry_date, scope, token_type, updated_at)
    VALUES (
      ${userId}, ${email},
      ${encryptSecret(tokens.access_token)}, ${encryptSecret(tokens.refresh_token)},
      ${tokens.expiry_date}, ${tokens.scope ?? null}, ${tokens.token_type ?? null}, now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      email = excluded.email,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expiry_date = excluded.expiry_date,
      scope = excluded.scope,
      token_type = excluded.token_type,
      updated_at = now()
  `;
}

/** Updates just the token material after a refresh (keeps refresh_token if unchanged). */
export async function updateGmailTokens(
  userId: string,
  tokens: StoredTokens
): Promise<void> {
  await db()`
    UPDATE gmail_accounts SET
      access_token = ${encryptSecret(tokens.access_token)},
      refresh_token = ${encryptSecret(tokens.refresh_token)},
      expiry_date = ${tokens.expiry_date},
      scope = ${tokens.scope ?? null},
      token_type = ${tokens.token_type ?? null},
      updated_at = now()
    WHERE user_id = ${userId}
  `;
}

export async function getGmailAccount(userId: string): Promise<GmailAccount | undefined> {
  const rows = await db()<Row[]>`SELECT * FROM gmail_accounts WHERE user_id = ${userId}`;
  return rows[0] ? fromRow(rows[0]) : undefined;
}

export async function hasGmailAccount(userId: string): Promise<boolean> {
  const rows = await db()<{ user_id: string }[]>`
    SELECT user_id FROM gmail_accounts WHERE user_id = ${userId}
  `;
  return rows.length > 0;
}

/** Resolves the account the stdio MCP server should act as. */
export async function resolveMcpGmailAccount(
  preferredEmail: string | undefined
): Promise<GmailAccount | undefined> {
  if (preferredEmail) {
    const rows = await db()<Row[]>`
      SELECT * FROM gmail_accounts WHERE email = ${preferredEmail} LIMIT 1
    `;
    return rows[0] ? fromRow(rows[0]) : undefined;
  }
  const rows = await db()<Row[]>`
    SELECT * FROM gmail_accounts ORDER BY updated_at DESC LIMIT 1
  `;
  return rows[0] ? fromRow(rows[0]) : undefined;
}
