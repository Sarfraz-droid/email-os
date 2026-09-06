import { Hono } from "hono";
import { getGmailClient } from "../../auth/gmail-client.js";
import { getAttachment } from "../../gmail/attachments.js";
import { requireAuth, type AuthVars } from "../middleware/require-auth.js";

export const attachmentRoutes = new Hono<{ Variables: AuthVars }>();

/**
 * Streams a single Gmail attachment back to the browser so the user can save it.
 * The bytes are fetched fresh from Gmail on each request; nothing is cached.
 */
attachmentRoutes.get("/api/attachment/:messageId/:attachmentId", requireAuth, async (c) => {
  const { messageId, attachmentId } = c.req.param();
  const filename = c.req.query("filename") || "attachment";
  const mime = c.req.query("mime") || "application/octet-stream";

  try {
    const gmail = await getGmailClient(c.get("user").id);
    const { data } = await getAttachment(gmail, messageId, attachmentId);

    return c.body(data as unknown as ArrayBuffer, 200, {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Content-Length": String(data.length),
      "Cache-Control": "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});
