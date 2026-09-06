import { createMiddleware } from "hono/factory";
import type { User } from "@email-os/shared";
import { resolveSession } from "../../db/sessions.js";
import { readSessionCookie } from "../../auth/session-cookie.js";

export interface AuthVars {
  user: User;
}

/** Rejects the request with 401 unless a valid session cookie is present. */
export const requireAuth = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  const token = readSessionCookie(c);
  const user = token ? await resolveSession(token) : undefined;
  if (!user) {
    return c.json({ error: "Not authenticated" }, 401);
  }
  c.set("user", user);
  await next();
});

/** Attaches `user` when a session exists, but never blocks the request. */
export const optionalAuth = createMiddleware<{ Variables: Partial<AuthVars> }>(
  async (c, next) => {
    const token = readSessionCookie(c);
    if (token) {
      const user = await resolveSession(token);
      if (user) c.set("user", user);
    }
    await next();
  }
);
