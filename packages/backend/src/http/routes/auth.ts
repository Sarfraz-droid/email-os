import { Hono } from "hono";
import type { MeResponse } from "@email-os/shared";
import { destroySession } from "../../db/sessions.js";
import { hasGmailAccount } from "../../db/gmail-accounts.js";
import { requireAuth, type AuthVars } from "../middleware/require-auth.js";
import { clearSessionCookie, readSessionCookie } from "../../auth/session-cookie.js";

export const authRoutes = new Hono<{ Variables: AuthVars }>();

authRoutes.get("/api/me", requireAuth, async (c) => {
  const user = c.get("user");
  const body: MeResponse = {
    user,
    gmailConnected: await hasGmailAccount(user.id),
  };
  return c.json(body);
});

authRoutes.post("/auth/logout", async (c) => {
  const token = readSessionCookie(c);
  if (token) await destroySession(token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});
