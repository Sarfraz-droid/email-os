import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { OAUTH_SCOPES, loadConfig } from "../config.js";
import type { IdTokenClaims } from "../db/users.js";

export function createOAuth2Client(): OAuth2Client {
  const config = loadConfig();
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

/** Consent URL. `state` is echoed back to the callback for CSRF defence. */
export function getAuthUrl(state: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: OAUTH_SCOPES,
    state,
  });
}

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope?: string;
  token_type?: string;
}

export interface ExchangeResult {
  tokens: StoredTokens;
  claims: IdTokenClaims;
}

export async function exchangeCode(code: string): Promise<ExchangeResult> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token returned. Revoke access at https://myaccount.google.com/permissions and try again."
    );
  }
  if (!tokens.access_token || !tokens.expiry_date) {
    throw new Error("Incomplete token response from Google.");
  }
  if (!tokens.id_token) {
    throw new Error("No id_token returned. Ensure the 'openid' scope is granted.");
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: loadConfig().google.clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("id_token is missing subject or email.");
  }

  return {
    tokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope ?? undefined,
      token_type: tokens.token_type ?? undefined,
    },
    claims: {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    },
  };
}
