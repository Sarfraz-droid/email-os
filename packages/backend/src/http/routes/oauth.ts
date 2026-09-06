import { randomBytes } from "node:crypto";
import { Hono, type Context } from "hono";
import { getAuthUrl, exchangeCode } from "../../auth/oauth.js";
import { loadConfig } from "../../config.js";
import { upsertUser } from "../../db/users.js";
import { upsertGmailAccount } from "../../db/gmail-accounts.js";
import { createSession } from "../../db/sessions.js";
import {
  clearStateCookie,
  readStateCookie,
  writeSessionCookie,
  writeStateCookie,
} from "../../auth/session-cookie.js";

export const oauthRoutes = new Hono();

function startLogin(c: Context) {
  const state = randomBytes(16).toString("base64url");
  writeStateCookie(c, state);
  return c.redirect(getAuthUrl(state));
}

oauthRoutes.get("/auth/google/start", (c) => startLogin(c));
// Back-compat alias.
oauthRoutes.get("/oauth/start", (c) => startLogin(c));

oauthRoutes.get("/oauth/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");
  const state = c.req.query("state");
  const expectedState = readStateCookie(c);
  clearStateCookie(c);

  if (error) {
    return c.html(`<p>Google OAuth error: ${error}</p>`, 400);
  }
  if (!code) {
    return c.html("<p>Missing authorization code.</p>", 400);
  }
  if (!state || !expectedState || state !== expectedState) {
    return c.html("<p>OAuth state mismatch. Please start the sign-in again.</p>", 400);
  }

  try {
    const { tokens, claims } = await exchangeCode(code);
    const user = await upsertUser(claims);
    await upsertGmailAccount(user.id, claims.email, tokens);

    const session = await createSession(user.id, c.req.header("user-agent"));
    writeSessionCookie(c, session.token, session.expiresAt);

    return c.redirect(loadConfig().app.baseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.html(`<p>Failed to sign in: ${message}</p>`, 500);
  }
});
