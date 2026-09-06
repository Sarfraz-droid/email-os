import type { gmail_v1 } from "googleapis";
import type { ThreadDetail, ThreadSummary } from "@email-os/shared";
import { collectBody, getHeader } from "./mime.js";

export async function listThreads(
  gmail: gmail_v1.Gmail,
  query: string,
  opts: { maxResults?: number; pageToken?: string; labelIds?: string[] } = {}
): Promise<{ threads: ThreadSummary[]; nextPageToken?: string }> {
  const list = await gmail.users.threads.list({
    userId: "me",
    q: query || undefined,
    maxResults: opts.maxResults ?? 20,
    pageToken: opts.pageToken,
    labelIds: opts.labelIds,
  });

  const threads: ThreadSummary[] = (list.data.threads ?? []).map((t) => ({
    id: t.id ?? "",
    snippet: t.snippet ?? "",
    messageCount: 0,
    labelIds: [],
  }));

  return { threads, nextPageToken: list.data.nextPageToken ?? undefined };
}

export async function getThread(gmail: gmail_v1.Gmail, id: string): Promise<ThreadDetail> {
  const res = await gmail.users.threads.get({ userId: "me", id, format: "full" });
  const messages = res.data.messages ?? [];

  const detailMessages = messages.map((msg) => {
    const headers = msg.payload?.headers;
    const { bodyText, bodyHtml, attachments } = collectBody(msg.payload ?? undefined);
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
      bodyText,
      bodyHtml,
      attachments,
    };
  });

  const labelIds = [...new Set(detailMessages.flatMap((m) => m.labelIds))];

  return {
    id: res.data.id ?? "",
    snippet: res.data.snippet ?? "",
    messageCount: detailMessages.length,
    labelIds,
    messages: detailMessages,
  };
}

export async function modifyThread(
  gmail: gmail_v1.Gmail,
  id: string,
  add: string[],
  remove: string[]
): Promise<void> {
  await gmail.users.threads.modify({
    userId: "me",
    id,
    requestBody: { addLabelIds: add, removeLabelIds: remove },
  });
}
