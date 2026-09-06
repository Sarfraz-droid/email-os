import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { db } from "./client.js";

export interface StoredMessage {
  seq: number;
  message: ChatCompletionMessageParam;
}

interface Row {
  seq: string; // INT8 → string
  content: ChatCompletionMessageParam;
}

/** All persisted messages for a conversation, in order. Excludes the system prompt. */
export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  const rows = await db()<Row[]>`
    SELECT seq, content FROM chat_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY seq ASC
  `;
  return rows.map((r) => ({ seq: Number(r.seq), message: r.content }));
}

export async function nextSeq(conversationId: string): Promise<number> {
  const rows = await db()<{ max: string | null }[]>`
    SELECT max(seq) AS max FROM chat_messages WHERE conversation_id = ${conversationId}
  `;
  const max = rows[0]?.max;
  return max === null || max === undefined ? 0 : Number(max) + 1;
}

/** Appends messages starting at `startSeq`. Returns the next free seq. */
export async function appendMessages(
  conversationId: string,
  startSeq: number,
  messages: ChatCompletionMessageParam[]
): Promise<number> {
  if (messages.length === 0) return startSeq;
  const values = messages.map((m, i) => ({
    conversation_id: conversationId,
    seq: startSeq + i,
    role: m.role,
    content: db().json(m as never),
  }));
  await db()`INSERT INTO chat_messages ${db()(values, "conversation_id", "seq", "role", "content")}`;
  return startSeq + messages.length;
}
