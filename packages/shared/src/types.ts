export interface Label {
  id: string;
  name: string;
  type?: string;
}

export interface MessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  labelIds: string[];
  unread: boolean;
}

export interface MessageDetail extends MessageSummary {
  bodyText: string;
  bodyHtml?: string;
  attachments: AttachmentRef[];
}

export interface AttachmentRef {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ThreadSummary {
  id: string;
  snippet: string;
  messageCount: number;
  labelIds: string[];
}

export interface ThreadDetail extends ThreadSummary {
  messages: MessageDetail[];
}

export type ToolResultPayload =
  | { kind: "messages"; messages: MessageSummary[]; nextPageToken?: string }
  | { kind: "message"; message: MessageDetail }
  | { kind: "threads"; threads: ThreadSummary[]; nextPageToken?: string }
  | { kind: "thread"; thread: ThreadDetail }
  | { kind: "labels"; labels: Label[] }
  | { kind: "ack"; message: string }
  | { kind: "raw"; data: unknown };

export type ChatEvent =
  | { type: "text"; data: { delta: string } }
  | { type: "tool_call"; data: { tool: string; input: unknown } }
  | { type: "tool_result"; data: { tool: string; result: ToolResultPayload } }
  | { type: "error"; data: { message: string } }
  | { type: "conversation"; data: { id: string; title: string } }
  | { type: "done"; data: Record<string, never> };

export interface ChatRequest {
  message: string;
  /** Omit to start a new conversation; the server creates one and streams a `conversation` event. */
  conversationId?: string;
}

/** The signed-in person. Mirrors a row of the `users` table (sans internal columns). */
export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface MeResponse {
  user: User;
  gmailConnected: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** One tool invocation as rendered in the transcript. */
export interface ToolActivity {
  tool: string;
  input?: unknown;
  result?: ToolResultPayload;
}

/**
 * A transcript entry as the UI renders it. Produced live by the chat stream and
 * reconstructed from persisted `chat_messages` rows by `GET /api/conversations/:id`.
 */
export interface UiChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolActivity[];
  error?: string;
}
