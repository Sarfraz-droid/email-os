import { createHash, randomBytes } from "node:crypto";
import type { User } from "@email-os/shared";
import { loadConfig } from "../config.js";
import { db } from "./client.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface NewSession {
  /** Raw token to put in the cookie. Only its hash is stored. */
  token: string;
  expiresAt: Date;
}

export async function createSession(
  userId: string,
  userAgent: string | undefined
): Promise<NewSession> {
  const token = randomBytes(32).toString("base64url");
  const ttlMs = loadConfig().session.ttlDays * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await db()`
    INSERT INTO sessions (id, user_id, expires_at, user_agent)
    VALUES (${hashToken(token)}, ${userId}, ${expiresAt}, ${userAgent ?? null})
  `;
  return { token, expiresAt };
}

/** Returns the session's user if the token maps to a live, unexpired session. */
export async function resolveSession(token: string): Promise<User | undefined> {
  const rows = await db()<User[]>`
    SELECT u.id, u.email, u.name, u.picture
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${hashToken(token)} AND s.expires_at > now()
  `;
  return rows[0];
}

export async function destroySession(token: string): Promise<void> {
  await db()`DELETE FROM sessions WHERE id = ${hashToken(token)}`;
}
