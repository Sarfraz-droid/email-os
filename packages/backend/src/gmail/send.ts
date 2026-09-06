import type { gmail_v1 } from "googleapis";
import { buildRawMime, getHeader } from "./mime.js";

export interface SendParams {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  threadId?: string;
}

export async function sendMessage(
  gmail: gmail_v1.Gmail,
  params: SendParams
): Promise<{ id: string; threadId: string }> {
  const raw = buildRawMime(params);
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: params.threadId },
  });
  return { id: res.data.id ?? "", threadId: res.data.threadId ?? "" };
}

export async function replyToMessage(
  gmail: gmail_v1.Gmail,
  messageId: string,
  bodyText: string
): Promise<{ id: string; threadId: string }> {
  const original = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const headers = original.data.payload?.headers;
  const subject = getHeader(headers, "Subject");
  const from = getHeader(headers, "From");
  const messageIdHeader = getHeader(headers, "Message-ID");
  const references = getHeader(headers, "References");

  const raw = buildRawMime({
    to: [from],
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    bodyText,
    inReplyTo: messageIdHeader || undefined,
    references: [references, messageIdHeader].filter(Boolean).join(" ") || undefined,
  });

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: original.data.threadId ?? undefined },
  });
  return { id: res.data.id ?? "", threadId: res.data.threadId ?? "" };
}

export async function forwardMessage(
  gmail: gmail_v1.Gmail,
  messageId: string,
  to: string[],
  note?: string
): Promise<{ id: string; threadId: string }> {
  const original = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const headers = original.data.payload?.headers;
  const subject = getHeader(headers, "Subject");
  const from = getHeader(headers, "From");
  const date = getHeader(headers, "Date");

  const quoted = `---------- Forwarded message ---------\nFrom: ${from}\nDate: ${date}\nSubject: ${subject}\n\n${original.data.snippet ?? ""}`;
  const bodyText = note ? `${note}\n\n${quoted}` : quoted;

  const raw = buildRawMime({
    to,
    subject: subject.startsWith("Fwd:") ? subject : `Fwd: ${subject}`,
    bodyText,
  });

  const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return { id: res.data.id ?? "", threadId: res.data.threadId ?? "" };
}
