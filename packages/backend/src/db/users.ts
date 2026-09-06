import type { User } from "@email-os/shared";
import { db } from "./client.js";

export interface IdTokenClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

/** Insert-or-update a user by their stable Google subject id. Returns the row. */
export async function upsertUser(claims: IdTokenClaims): Promise<User> {
  const rows = await db()<User[]>`
    INSERT INTO users (google_sub, email, name, picture, last_login_at)
    VALUES (${claims.sub}, ${claims.email}, ${claims.name ?? null}, ${claims.picture ?? null}, now())
    ON CONFLICT (google_sub) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      picture = excluded.picture,
      last_login_at = now()
    RETURNING id, email, name, picture
  `;
  return rows[0]!;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const rows = await db()<User[]>`
    SELECT id, email, name, picture FROM users WHERE id = ${id}
  `;
  return rows[0];
}
