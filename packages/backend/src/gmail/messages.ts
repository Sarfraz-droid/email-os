import type { gmail_v1 } from "googleapis";
import type { MessageDetail, MessageSummary } from "@email-os/shared";
import { collectBody, getHeader } from "./mime.js";

function toSummary(msg: gmail_v1.Schema$Message): MessageSummary {
  const headers = msg.payload?.headers;
  return {
    id: msg.id ?? "",
    threadId: msg.threadId ?? "",
    snippet: msg.snippet ?? "",
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    date: getHeader(headers, "Date"),
    labelIds: msg.labelIds ?? [],
    unread: (msg.labelIds ?? []).includes("UNREAD"),
  };
}

export async function listMessages(
  gmail: gmail_v1.Gmail,
  query: string,
  opts: { maxResults?: number; pageToken?: string; labelIds?: string[] } = {}
): Promise<{ messages: MessageSummary[]; nextPageToken?: string }> {
  const list = await gmail.users.messages.list({
    userId: "me",
    q: query || undefined,
    maxResults: opts.maxResults ?? 20,
    pageToken: opts.pageToken,
    labelIds: opts.labelIds,
  });

  const ids = list.data.messages ?? [];
  const messages = await Promise.all(
    ids.map(async (m) => {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: m.id ?? "",
        format: "metadata",
        metadataHeaders: ["Subject", "From", "To", "Date"],
      });
      return toSummary(full.data);
    })
  );

  return { messages, nextPageToken: list.data.nextPageToken ?? undefined };
}

export async function getMessage(
  gmail: gmail_v1.Gmail,
  id: string
): Promise<MessageDetail> {
  const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const summary = toSummary(res.data);
  const { bodyText, bodyHtml, attachments } = collectBody(res.data.payload ?? undefined);
  return { ...summary, bodyText, bodyHtml, attachments };
}

export async function markRead(gmail: gmail_v1.Gmail, id: string, read: boolean): Promise<void> {
  await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] },
  });
}

export async function archiveMessage(gmail: gmail_v1.Gmail, id: string): Promise<void> {
  await gmail.users.messages.modify({ userId: "me", id, requestBody: { removeLabelIds: ["INBOX"] } });
}

export async function trashMessage(gmail: gmail_v1.Gmail, id: string): Promise<void> {
  await gmail.users.messages.trash({ userId: "me", id });
}

export async function untrashMessage(gmail: gmail_v1.Gmail, id: string): Promise<void> {
  await gmail.users.messages.untrash({ userId: "me", id });
}

export async function markSpam(gmail: gmail_v1.Gmail, id: string): Promise<void> {
  await gmail.users.messages.modify({ userId: "me", id, requestBody: { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] } });
}

export async function unmarkSpam(gmail: gmail_v1.Gmail, id: string): Promise<void> {
  await gmail.users.messages.modify({ userId: "me", id, requestBody: { removeLabelIds: ["SPAM"], addLabelIds: ["INBOX"] } });
}
