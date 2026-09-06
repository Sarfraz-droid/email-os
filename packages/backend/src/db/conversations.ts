import type { ConversationSummary } from "@email-os/shared";
import { db } from "./client.js";

interface Row {
  id: string;
  title: string;
  updated_at: Date;
}

function fromRow(r: Row): ConversationSummary {
  return { id: r.id, title: r.title, updatedAt: new Date(r.updated_at).toISOString() };
}

export function titleFromMessage(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean || "New chat";
}

export async function createConversation(
  userId: string,
  title: string
): Promise<ConversationSummary> {
  const rows = await db()<Row[]>`
    INSERT INTO conversations (user_id, title)
    VALUES (${userId}, ${title})
    RETURNING id, title, updated_at
  `;
  return fromRow(rows[0]!);
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const rows = await db()<Row[]>`
    SELECT id, title, updated_at FROM conversations
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT 200
  `;
  return rows.map(fromRow);
}

/** Returns the conversation only if it belongs to the user. */
export async function getOwnedConversation(
  userId: string,
  id: string
): Promise<ConversationSummary | undefined> {
  const rows = await db()<Row[]>`
    SELECT id, title, updated_at FROM conversations
    WHERE id = ${id} AND user_id = ${userId}
  `;
  return rows[0] ? fromRow(rows[0]) : undefined;
}

export async function touchConversation(id: string): Promise<void> {
  await db()`UPDATE conversations SET updated_at = now() WHERE id = ${id}`;
}

export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  const rows = await db()<{ id: string }[]>`
    DELETE FROM conversations WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `;
  return rows.length > 0;
}
