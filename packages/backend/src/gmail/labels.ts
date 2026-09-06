import type { gmail_v1 } from "googleapis";
import type { Label } from "@email-os/shared";

function toLabel(l: gmail_v1.Schema$Label): Label {
  return { id: l.id ?? "", name: l.name ?? "", type: l.type ?? undefined };
}

export async function listLabels(gmail: gmail_v1.Gmail): Promise<Label[]> {
  const res = await gmail.users.labels.list({ userId: "me" });
  return (res.data.labels ?? []).map(toLabel);
}

export async function createLabel(gmail: gmail_v1.Gmail, name: string): Promise<Label> {
  const res = await gmail.users.labels.create({
    userId: "me",
    requestBody: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
  });
  return toLabel(res.data);
}

export async function updateLabel(
  gmail: gmail_v1.Gmail,
  id: string,
  patch: { name?: string }
): Promise<Label> {
  const res = await gmail.users.labels.patch({ userId: "me", id, requestBody: patch });
  return toLabel(res.data);
}

export async function deleteLabel(gmail: gmail_v1.Gmail, id: string): Promise<void> {
  await gmail.users.labels.delete({ userId: "me", id });
}

export async function applyLabels(gmail: gmail_v1.Gmail, messageId: string, labelIds: string[]): Promise<void> {
  await gmail.users.messages.modify({ userId: "me", id: messageId, requestBody: { addLabelIds: labelIds } });
}

export async function removeLabels(gmail: gmail_v1.Gmail, messageId: string, labelIds: string[]): Promise<void> {
  await gmail.users.messages.modify({ userId: "me", id: messageId, requestBody: { removeLabelIds: labelIds } });
}
