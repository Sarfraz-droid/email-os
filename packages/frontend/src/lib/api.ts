import type {
  ChatEvent,
  ConversationSummary,
  DashboardAssistantReply,
  DashboardSpec,
  DashboardSummary,
  DashboardView,
  GridItem,
  MeResponse,
  ThreadDetail,
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

// ── Generative dashboards ──────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  /** True for transport failures / 5xx — the caller may retry. */
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * JSON fetch with bounded retry on the failures the user was hitting: dropped
 * connections ("Failed to fetch") and 502/503/504. 4xx are surfaced immediately.
 */
async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  opts: { retries?: number; retryOn5xx?: boolean } = {}
): Promise<T> {
  const retries = opts.retries ?? 3;
  const retryOn5xx = opts.retryOn5xx ?? true;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(500 * 2 ** (attempt - 1), 4000));
    try {
      const res = await fetch(`${BACKEND_URL}${path}`, { ...withCreds, ...init });
      if (res.status === 401) {
        throw new ApiError("Your session expired — sign in again.", 401, false);
      }
      const body = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (res.ok) return body as T;

      const msg = (body as { error?: string }).error ?? `Request failed (${res.status})`;
      const retryable = retryOn5xx && res.status >= 500;
      if (!retryable) throw new ApiError(msg, res.status, false);
      lastErr = new ApiError(msg, res.status, true);
    } catch (err) {
      if (err instanceof ApiError && !err.retryable) throw err;
      // TypeError from fetch = network/transport failure.
      lastErr =
        err instanceof ApiError
          ? err
          : new ApiError(
              err instanceof Error ? err.message : "Network error",
              0,
              true
            );
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new ApiError("Network error", 0, true);
}

export async function listDashboards(): Promise<DashboardSummary[]> {
  const body = await apiFetch<{ dashboards: DashboardSummary[] }>("/api/dashboards");
  return body.dashboards;
}

export async function getDashboard(id: string): Promise<DashboardView> {
  const body = await apiFetch<{ dashboard: DashboardView }>(`/api/dashboards/${id}`);
  return body.dashboard;
}

/** Reads the original Gmail conversation used as evidence for a dashboard row. */
export async function getDashboardSourceThread(
  dashboardId: string,
  threadId: string
): Promise<ThreadDetail> {
  const body = await apiFetch<{ thread: ThreadDetail }>(
    `/api/dashboards/${encodeURIComponent(dashboardId)}/sources/${encodeURIComponent(threadId)}`
  );
  return body.thread;
}

/** Generates a spec from a plain-language prompt and stores the dashboard. */
export async function createDashboard(prompt: string): Promise<DashboardView> {
  // Spec generation is a slow LLM call; don't hammer it with retries.
  const body = await apiFetch<{ dashboard: DashboardView }>(
    "/api/dashboards",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    },
    { retries: 1, retryOn5xx: false }
  );
  return body.dashboard;
}

/** Kicks off a background refresh; returns the dashboard with `refreshState`. */
export async function startDashboardRefresh(id: string): Promise<DashboardView> {
  const body = await apiFetch<{ dashboard: DashboardView }>(
    `/api/dashboards/${id}/refresh`,
    { method: "POST" }
  );
  return body.dashboard;
}

export async function updateDashboardSpec(
  id: string,
  spec: DashboardSpec
): Promise<DashboardView> {
  const body = await apiFetch<{ dashboard: DashboardView }>(`/api/dashboards/${id}/spec`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spec }),
  });
  return body.dashboard;
}

export async function updateDashboardLayout(
  id: string,
  layout: GridItem[]
): Promise<DashboardView> {
  const body = await apiFetch<{ dashboard: DashboardView }>(`/api/dashboards/${id}/layout`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layout }),
  });
  return body.dashboard;
}

export async function askDashboardAssistant(
  id: string,
  message: string
): Promise<DashboardAssistantReply> {
  return apiFetch<DashboardAssistantReply>(
    `/api/dashboards/${id}/assistant`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
    { retries: 1, retryOn5xx: false }
  );
}

export async function deleteDashboard(id: string): Promise<void> {
  await apiFetch(`/api/dashboards/${id}`, { method: "DELETE" }).catch((err) => {
    if (err instanceof ApiError && err.status === 404) return;
    throw err;
  });
}
