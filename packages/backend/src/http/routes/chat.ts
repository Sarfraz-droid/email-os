import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ChatRequest, ConversationSummary } from "@email-os/shared";
import { runChatLoop } from "../../agent/chat-loop.js";
import {
  createConversation,
  getOwnedConversation,
  titleFromMessage,
} from "../../db/conversations.js";
import { requireAuth, type AuthVars } from "../middleware/require-auth.js";

export const chatRoutes = new Hono<{ Variables: AuthVars }>();

chatRoutes.post("/api/chat", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<ChatRequest>();

  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    return c.json({ error: "message is required" }, 400);
  }

  let conversation: ConversationSummary;
  let isNew = false;

  if (body.conversationId) {
    const existing = await getOwnedConversation(user.id, body.conversationId);
    if (!existing) return c.json({ error: "conversation not found" }, 404);
    conversation = existing;
  } else {
    conversation = await createConversation(user.id, titleFromMessage(body.message));
    isNew = true;
  }

  return streamSSE(c, async (stream) => {
    if (isNew) {
      await stream.writeSSE({
        event: "conversation",
        data: JSON.stringify({ id: conversation.id, title: conversation.title }),
      });
    }
    for await (const event of runChatLoop({
      userId: user.id,
      conversationId: conversation.id,
      message: body.message,
    })) {
      await stream.writeSSE({ event: event.type, data: JSON.stringify(event.data) });
    }
  });
});
