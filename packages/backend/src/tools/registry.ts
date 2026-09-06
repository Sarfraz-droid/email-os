import { z } from "zod";
import type { gmail_v1 } from "googleapis";
import type { ToolResultPayload } from "@email-os/shared";
import * as messages from "../gmail/messages.js";
import * as threads from "../gmail/threads.js";
import * as labels from "../gmail/labels.js";
import * as send from "../gmail/send.js";
import * as drafts from "../gmail/drafts.js";
import * as attachments from "../gmail/attachments.js";
import * as batch from "../gmail/batch.js";

export interface ToolSpec<TShape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  shape: TShape;
  handler: (gmail: gmail_v1.Gmail, input: z.objectOutputType<TShape, z.ZodTypeAny>) => Promise<ToolResultPayload>;
}

function tool<TShape extends z.ZodRawShape>(spec: ToolSpec<TShape>): ToolSpec<TShape> {
  return spec;
}

export const toolSpecs: ToolSpec<any>[] = [
  tool({
    name: "search_messages",
    description:
      "Search Gmail messages using Gmail search syntax (e.g. 'from:alice subject:invoice is:unread newer_than:7d').",
    shape: {
      query: z.string().describe("Gmail search query. Empty string lists most recent messages."),
      maxResults: z.number().int().min(1).max(50).optional(),
      pageToken: z.string().optional(),
    },
    handler: async (gmail, input) => {
      const result = await messages.listMessages(gmail, input.query, {
        maxResults: input.maxResults,
        pageToken: input.pageToken,
      });
      return { kind: "messages", ...result };
    },
  }),
  tool({
    name: "get_message",
    description: "Get the full content (body, headers, attachments) of a single Gmail message by id.",
    shape: { id: z.string() },
    handler: async (gmail, input) => ({ kind: "message", message: await messages.getMessage(gmail, input.id) }),
  }),
  tool({
    name: "mark_read",
    description: "Mark a message as read or unread.",
    shape: { id: z.string(), read: z.boolean() },
    handler: async (gmail, input) => {
      await messages.markRead(gmail, input.id, input.read);
      return { kind: "ack", message: `Marked ${input.id} as ${input.read ? "read" : "unread"}` };
    },
  }),
  tool({
    name: "archive_message",
    description: "Archive a message (remove it from the inbox).",
    shape: { id: z.string() },
    handler: async (gmail, input) => {
      await messages.archiveMessage(gmail, input.id);
      return { kind: "ack", message: `Archived ${input.id}` };
    },
  }),
  tool({
    name: "trash_message",
    description: "Move a message to trash.",
    shape: { id: z.string() },
    handler: async (gmail, input) => {
      await messages.trashMessage(gmail, input.id);
      return { kind: "ack", message: `Trashed ${input.id}` };
    },
  }),
  tool({
    name: "untrash_message",
    description: "Restore a message from trash.",
    shape: { id: z.string() },
    handler: async (gmail, input) => {
      await messages.untrashMessage(gmail, input.id);
      return { kind: "ack", message: `Untrashed ${input.id}` };
    },
  }),
  tool({
    name: "mark_spam",
    description: "Mark a message as spam.",
    shape: { id: z.string() },
    handler: async (gmail, input) => {
      await messages.markSpam(gmail, input.id);
      return { kind: "ack", message: `Marked ${input.id} as spam` };
    },
  }),
  tool({
    name: "unmark_spam",
    description: "Remove the spam label from a message.",
    shape: { id: z.string() },
    handler: async (gmail, input) => {
      await messages.unmarkSpam(gmail, input.id);
      return { kind: "ack", message: `Unmarked spam on ${input.id}` };
    },
  }),
  tool({
    name: "search_threads",
    description: "Search Gmail threads using Gmail search syntax.",
    shape: {
      query: z.string(),
      maxResults: z.number().int().min(1).max(50).optional(),
      pageToken: z.string().optional(),
    },
    handler: async (gmail, input) => {
      const result = await threads.listThreads(gmail, input.query, {
        maxResults: input.maxResults,
        pageToken: input.pageToken,
      });
      return { kind: "threads", ...result };
    },
  }),
  tool({
    name: "get_thread",
    description: "Get a full thread, including every message in it, by thread id.",
    shape: { id: z.string() },
    handler: async (gmail, input) => ({ kind: "thread", thread: await threads.getThread(gmail, input.id) }),
  }),
  tool({
    name: "modify_thread_labels",
    description: "Add and/or remove labels from an entire thread.",
    shape: { id: z.string(), addLabelIds: z.array(z.string()).default([]), removeLabelIds: z.array(z.string()).default([]) },
    handler: async (gmail, input) => {
      await threads.modifyThread(gmail, input.id, input.addLabelIds, input.removeLabelIds);
      return { kind: "ack", message: `Modified labels on thread ${input.id}` };
    },
  }),
  tool({
    name: "list_labels",
    description: "List all Gmail labels (system and user-created).",
    shape: {},
    handler: async (gmail) => ({ kind: "labels", labels: await labels.listLabels(gmail) }),
  }),
  tool({
    name: "create_label",
    description: "Create a new user label.",
    shape: { name: z.string() },
    handler: async (gmail, input) => {
      const label = await labels.createLabel(gmail, input.name);
      return { kind: "labels", labels: [label] };
    },
  }),
  tool({
    name: "update_label",
    description: "Rename an existing label.",
    shape: { id: z.string(), name: z.string() },
    handler: async (gmail, input) => {
      const label = await labels.updateLabel(gmail, input.id, { name: input.name });
      return { kind: "labels", labels: [label] };
    },
  }),
  tool({
    name: "delete_label",
    description: "Delete a user label.",
    shape: { id: z.string() },
    handler: async (gmail, input) => {
      await labels.deleteLabel(gmail, input.id);
      return { kind: "ack", message: `Deleted label ${input.id}` };
    },
  }),
  tool({
    name: "apply_labels",
    description: "Apply one or more labels to a message.",
    shape: { messageId: z.string(), labelIds: z.array(z.string()) },
    handler: async (gmail, input) => {
      await labels.applyLabels(gmail, input.messageId, input.labelIds);
      return { kind: "ack", message: `Applied labels to ${input.messageId}` };
    },
  }),
  tool({
    name: "remove_labels",
    description: "Remove one or more labels from a message.",
    shape: { messageId: z.string(), labelIds: z.array(z.string()) },
    handler: async (gmail, input) => {
      await labels.removeLabels(gmail, input.messageId, input.labelIds);
      return { kind: "ack", message: `Removed labels from ${input.messageId}` };
    },
  }),
  tool({
    name: "send_message",
    description: "Send a new email.",
    shape: {
      to: z.array(z.string()),
      cc: z.array(z.string()).optional(),
      bcc: z.array(z.string()).optional(),
      subject: z.string(),
      bodyText: z.string(),
    },
    handler: async (gmail, input) => {
      const result = await send.sendMessage(gmail, input);
      return { kind: "ack", message: `Sent message ${result.id}` };
    },
  }),
  tool({
    name: "reply_message",
    description: "Reply to an existing message within its thread.",
    shape: { messageId: z.string(), bodyText: z.string() },
    handler: async (gmail, input) => {
      const result = await send.replyToMessage(gmail, input.messageId, input.bodyText);
      return { kind: "ack", message: `Replied, new message ${result.id}` };
    },
  }),
  tool({
    name: "forward_message",
    description: "Forward an existing message to new recipients.",
    shape: { messageId: z.string(), to: z.array(z.string()), note: z.string().optional() },
    handler: async (gmail, input) => {
      const result = await send.forwardMessage(gmail, input.messageId, input.to, input.note);
      return { kind: "ack", message: `Forwarded, new message ${result.id}` };
    },
  }),
  tool({
    name: "create_draft",
    description: "Create a draft email.",
    shape: {
      to: z.array(z.string()),
      cc: z.array(z.string()).optional(),
      bcc: z.array(z.string()).optional(),
      subject: z.string(),
      bodyText: z.string(),
    },
    handler: async (gmail, input) => {
      const result = await drafts.createDraft(gmail, input);
      return { kind: "ack", message: `Created draft ${result.id}` };
    },
  }),
  tool({
    name: "update_draft",
    description: "Update an existing draft.",
    shape: {
      draftId: z.string(),
      to: z.array(z.string()),
      cc: z.array(z.string()).optional(),
      bcc: z.array(z.string()).optional(),
      subject: z.string(),
      bodyText: z.string(),
    },
    handler: async (gmail, input) => {
      const { draftId, ...params } = input;
      const result = await drafts.updateDraft(gmail, draftId, params);
      return { kind: "ack", message: `Updated draft ${result.id}` };
    },
  }),
  tool({
    name: "send_draft",
    description: "Send an existing draft.",
    shape: { draftId: z.string() },
    handler: async (gmail, input) => {
      const result = await drafts.sendDraft(gmail, input.draftId);
      return { kind: "ack", message: `Sent draft as message ${result.id}` };
    },
  }),
  tool({
    name: "list_drafts",
    description: "List all drafts.",
    shape: {},
    handler: async (gmail) => ({ kind: "raw", data: await drafts.listDrafts(gmail) }),
  }),
  tool({
    name: "delete_draft",
    description: "Delete a draft.",
    shape: { draftId: z.string() },
    handler: async (gmail, input) => {
      await drafts.deleteDraft(gmail, input.draftId);
      return { kind: "ack", message: `Deleted draft ${input.draftId}` };
    },
  }),
  tool({
    name: "get_attachment",
    description: "Fetch attachment bytes (returned as base64) for a message.",
    shape: { messageId: z.string(), attachmentId: z.string() },
    handler: async (gmail, input) => {
      const result = await attachments.getAttachment(gmail, input.messageId, input.attachmentId);
      return { kind: "raw", data: { base64: result.data.toString("base64"), size: result.size } };
    },
  }),
  tool({
    name: "batch_modify_messages",
    description: "Add and/or remove labels across many messages at once (e.g. bulk archive/mark-read).",
    shape: {
      ids: z.array(z.string()),
      addLabelIds: z.array(z.string()).default([]),
      removeLabelIds: z.array(z.string()).default([]),
    },
    handler: async (gmail, input) => {
      await batch.batchModifyMessages(gmail, input.ids, input.addLabelIds, input.removeLabelIds);
      return { kind: "ack", message: `Modified ${input.ids.length} messages` };
    },
  }),
  tool({
    name: "batch_archive_messages",
    description: "Archive many messages at once.",
    shape: { ids: z.array(z.string()) },
    handler: async (gmail, input) => {
      await batch.batchArchiveMessages(gmail, input.ids);
      return { kind: "ack", message: `Archived ${input.ids.length} messages` };
    },
  }),
  tool({
    name: "batch_trash_messages",
    description: "Trash many messages at once.",
    shape: { ids: z.array(z.string()) },
    handler: async (gmail, input) => {
      await batch.batchTrashMessages(gmail, input.ids);
      return { kind: "ack", message: `Trashed ${input.ids.length} messages` };
    },
  }),
];

export function findTool(name: string): ToolSpec<any> | undefined {
  return toolSpecs.find((t) => t.name === name);
}
