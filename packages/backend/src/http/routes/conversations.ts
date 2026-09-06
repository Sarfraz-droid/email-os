import { Hono } from "hono";
import {
  deleteConversation,
  getOwnedConversation,
  listConversations,
} from "../../db/conversations.js";
import { loadMessages } from "../../db/chat-messages.js";
import { toUiMessages } from "../../agent/transcript.js";
import { requireAuth, type AuthVars } from "../middleware/require-auth.js";

export const conversationRoutes = new Hono<{ Variables: AuthVars }>();

conversationRoutes.use("/api/conversations", requireAuth);
conversationRoutes.use("/api/conversations/*", requireAuth);

conversationRoutes.get("/api/conversations", async (c) => {
  return c.json({ conversations: await listConversations(c.get("user").id) });
});

conversationRoutes.get("/api/conversations/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const conversation = await getOwnedConversation(user.id, id);
  if (!conversation) return c.json({ error: "Not found" }, 404);

  const stored = await loadMessages(id);
  return c.json({
    conversation,
    messages: toUiMessages(stored.map((s) => s.message)),
  });
});

conversationRoutes.delete("/api/conversations/:id", async (c) => {
  const removed = await deleteConversation(c.get("user").id, c.req.param("id"));
  if (!removed) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
