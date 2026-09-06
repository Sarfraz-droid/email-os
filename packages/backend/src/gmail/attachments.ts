import type { gmail_v1 } from "googleapis";

export async function getAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string
): Promise<{ data: Buffer; size: number }> {
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  const data = Buffer.from(res.data.data ?? "", "base64url");
  return { data, size: res.data.size ?? data.length };
}
