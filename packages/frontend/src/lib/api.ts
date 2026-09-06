import type {
  ChatEvent,
  ConversationSummary,
  MeResponse,
  UiChatMessage,
} from "@email-os/shared";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8787";

/** Every request carries the session cookie. */
const withCreds: RequestInit = { credentials: "include" };

export async function fetchHealth(): Promise<{
  ok: boolean;
  authenticated: boolean;
  gmailConnected: boolean;
}> {
  const res = await fetch(`${BACKEND_URL}/health`, withCreds);
  return res.json();
}

/** Current user, or `null` when not signed in (401). */
export async function getMe(): Promise<MeResponse | null> {
  const res = await fetch(`${BACKEND_URL}/api/me`, withCreds);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/me failed: ${res.status}`);
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${BACKEND_URL}/auth/logout`, { ...withCreds, method: "POST" });
}

export function getLoginUrl(): string {
  return `${BACKEND_URL}/auth/google/start`;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await fetch(`${BACKEND_URL}/api/conversations`, withCreds);
  if (!res.ok) throw new Error(`GET /api/conversations failed: ${res.status}`);
  const body = (await res.json()) as { conversations: ConversationSummary[] };
  return body.conversations;
}

export async function getConversation(id: string): Promise<{
  conversation: ConversationSummary;
  messages: UiChatMessage[];
}> {
  const res = await fetch(`${BACKEND_URL}/api/conversations/${id}`, withCreds);
  if (!res.ok) throw new Error(`GET /api/conversations/${id} failed: ${res.status}`);
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/conversations/${id}`, {
    ...withCreds,
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`DELETE /api/conversations/${id} failed: ${res.status}`);
  }
}

/** Backend URL that streams a single Gmail attachment as a download. */
export function getAttachmentUrl(
  messageId: string,
  attachmentId: string,
  filename: string,
  mimeType: string
): string {
  const q = new URLSearchParams({ filename, mime: mimeType });
  return `${BACKEND_URL}/api/attachment/${encodeURIComponent(messageId)}/${encodeURIComponent(
    attachmentId
  )}?${q.toString()}`;
}

/**
 * POSTs to the chat endpoint and parses the SSE response manually, since the
 * native EventSource API cannot send a POST body.
 */
export async function streamChat(
  message: string,
  conversationId: string | null,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    ...withCreds,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      conversationId ? { message, conversationId } : { message }
    ),
    signal,
  });

  if (res.status === 401) throw new Error("Your session expired. Please sign in again.");
  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const rawEvents = buffer.split("\n\n");
    buffer = rawEvents.pop() ?? "";

    for (const raw of rawEvents) {
      const event = parseSseEvent(raw);
      if (event) onEvent(event);
    }
  }
}

function parseSseEvent(raw: string): ChatEvent | undefined {
  let type: string | undefined;
  let data = "";

  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }

  if (!type) return undefined;
  try {
    return { type, data: JSON.parse(data) } as ChatEvent;
  } catch {
    return undefined;
  }
}
