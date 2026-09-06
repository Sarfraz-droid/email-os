import type { gmail_v1 } from "googleapis";
import { buildRawMime } from "./mime.js";
import type { SendParams } from "./send.js";

export async function createDraft(gmail: gmail_v1.Gmail, params: SendParams): Promise<{ id: string }> {
  const raw = buildRawMime(params);
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw, threadId: params.threadId } },
  });
  return { id: res.data.id ?? "" };
}

export async function updateDraft(
  gmail: gmail_v1.Gmail,
  draftId: string,
  params: SendParams
): Promise<{ id: string }> {
  const raw = buildRawMime(params);
  const res = await gmail.users.drafts.update({
    userId: "me",
    id: draftId,
    requestBody: { message: { raw, threadId: params.threadId } },
  });
  return { id: res.data.id ?? "" };
}

export async function sendDraft(gmail: gmail_v1.Gmail, draftId: string): Promise<{ id: string; threadId: string }> {
  const res = await gmail.users.drafts.send({ userId: "me", requestBody: { id: draftId } });
  return { id: res.data.id ?? "", threadId: res.data.threadId ?? "" };
}

export async function listDrafts(gmail: gmail_v1.Gmail): Promise<{ id: string; snippet: string }[]> {
  const res = await gmail.users.drafts.list({ userId: "me" });
  return (res.data.drafts ?? []).map((d) => ({ id: d.id ?? "", snippet: d.message?.snippet ?? "" }));
}

export async function deleteDraft(gmail: gmail_v1.Gmail, draftId: string): Promise<void> {
  await gmail.users.drafts.delete({ userId: "me", id: draftId });
}
