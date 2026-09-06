import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { OAuth2Client } from "google-auth-library";
import { loadConfig } from "../config.js";
import { createOAuth2Client, type StoredTokens } from "./oauth.js";
import {
  getGmailAccount,
  resolveMcpGmailAccount,
  updateGmailTokens,
} from "../db/gmail-accounts.js";

const EXPIRY_SKEW_MS = 60_000;

interface Refreshed {
  client: OAuth2Client;
  tokens: StoredTokens;
  didRefresh: boolean;
}

/** Loads `tokens` into an OAuth2 client, refreshing against Google if expired. */
async function withValidToken(tokens: StoredTokens): Promise<Refreshed> {
  const client = createOAuth2Client();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  if (tokens.expiry_date - EXPIRY_SKEW_MS > Date.now()) {
    return { client, tokens, didRefresh: false };
  }

  const { credentials } = await client.refreshAccessToken();
  const refreshed: StoredTokens = {
    access_token: credentials.access_token ?? tokens.access_token,
    refresh_token: credentials.refresh_token ?? tokens.refresh_token,
    expiry_date: credentials.expiry_date ?? Date.now() + 55 * 60_000,
    scope: credentials.scope ?? tokens.scope,
    token_type: credentials.token_type ?? tokens.token_type,
  };
  client.setCredentials(refreshed);
  return { client, tokens: refreshed, didRefresh: true };
}

/** OAuth2 client for a signed-in web user, backed by the `gmail_accounts` table. */
export async function getValidAccessToken(userId: string): Promise<OAuth2Client> {
  const account = await getGmailAccount(userId);
  if (!account) {
    throw new Error(
      "No Gmail access for this account. Sign in with Google again to grant mailbox access."
    );
  }
  const { client, tokens, didRefresh } = await withValidToken(account);
  if (didRefresh) await updateGmailTokens(userId, tokens);
  return client;
}

/**
 * OAuth2 client for the stdio MCP server (single account, no HTTP session).
 * Uses the database when `DATABASE_URL` is set, otherwise the legacy token file.
 */
export async function getValidAccessTokenForMcp(): Promise<OAuth2Client> {
  const config = loadConfig();

  if (config.database.url) {
    const account = await resolveMcpGmailAccount(config.mcpAccountEmail);
    if (!account) {
      throw new Error(
        "No Gmail accounts found in the database. Sign in through the web app first, " +
          "or set MCP_ACCOUNT_EMAIL to a connected account."
      );
    }
    const { client, tokens, didRefresh } = await withValidToken(account);
    if (didRefresh) await updateGmailTokens(account.userId, tokens);
    return client;
  }

  const fileTokens = await readFileTokens();
  if (!fileTokens) {
    throw new Error(
      "No stored Gmail tokens. Connect a Gmail account through the web app (/auth/google/start)."
    );
  }
  const { client, tokens, didRefresh } = await withValidToken(fileTokens);
  if (didRefresh) await writeFileTokens(tokens);
  return client;
}

// --- Legacy single-account file store (MCP fallback only) --------------------

async function readFileTokens(): Promise<StoredTokens | undefined> {
  const file = Bun.file(loadConfig().tokenFilePath);
  if (!(await file.exists())) return undefined;
  return (await file.json()) as StoredTokens;
}

async function writeFileTokens(tokens: StoredTokens): Promise<void> {
  const path = loadConfig().tokenFilePath;
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(tokens, null, 2));
}
