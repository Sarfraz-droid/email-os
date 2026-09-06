import type { gmail_v1 } from "googleapis";

export async function batchModifyMessages(
  gmail: gmail_v1.Gmail,
  ids: string[],
  add: string[],
  remove: string[]
): Promise<void> {
  await gmail.users.messages.batchModify({
    userId: "me",
    requestBody: { ids, addLabelIds: add, removeLabelIds: remove },
  });
}

export async function batchModifyThreads(
  gmail: gmail_v1.Gmail,
  ids: string[],
  add: string[],
  remove: string[]
): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      gmail.users.threads.modify({
        userId: "me",
        id,
        requestBody: { addLabelIds: add, removeLabelIds: remove },
      })
    )
  );
}

export async function batchArchiveMessages(gmail: gmail_v1.Gmail, ids: string[]): Promise<void> {
  await batchModifyMessages(gmail, ids, [], ["INBOX"]);
}

export async function batchTrashMessages(gmail: gmail_v1.Gmail, ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => gmail.users.messages.trash({ userId: "me", id })));
}
