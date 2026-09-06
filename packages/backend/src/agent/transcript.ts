import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ToolActivity, ToolResultPayload, UiChatMessage } from "@email-os/shared";

let counter = 0;
const nextId = () => `h${(counter++).toString(36)}`;

function textOf(content: ChatCompletionMessageParam["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

/**
 * Rebuilds the UI transcript from persisted raw OpenAI messages — the mirror of
 * what `useChatStream` assembles live. Each user message starts a new turn; the
 * assistant text and every tool call/result until the next user message collapse
 * into one assistant bubble.
 */
export function toUiMessages(raw: ChatCompletionMessageParam[]): UiChatMessage[] {
  const out: UiChatMessage[] = [];
  let assistant: UiChatMessage | undefined;
  const pendingTools = new Map<string, ToolActivity>();

  const flush = () => {
    if (assistant) out.push(assistant);
    assistant = undefined;
    pendingTools.clear();
  };

  for (const msg of raw) {
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      flush();
      out.push({ id: nextId(), role: "user", text: textOf(msg.content), tools: [] });
      continue;
    }

    if (msg.role === "assistant") {
      if (!assistant) assistant = { id: nextId(), role: "assistant", text: "", tools: [] };
      assistant.text += textOf(msg.content);
      for (const call of msg.tool_calls ?? []) {
        if (call.type !== "function") continue;
        let input: unknown = {};
        try {
          input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          input = call.function.arguments;
        }
        const activity: ToolActivity = { tool: call.function.name, input };
        assistant.tools.push(activity);
        pendingTools.set(call.id, activity);
      }
      continue;
    }

    if (msg.role === "tool") {
      const activity = pendingTools.get(msg.tool_call_id);
      if (activity) {
        try {
          activity.result = JSON.parse(textOf(msg.content)) as ToolResultPayload;
        } catch {
          activity.result = { kind: "raw", data: textOf(msg.content) };
        }
      }
    }
  }

  flush();
  return out;
}
