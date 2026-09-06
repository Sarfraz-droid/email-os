import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChatEvent } from "@email-os/shared";
import { getLlmClient } from "./llm-client.js";
import { openAiTools, dispatchTool } from "./tool-definitions.js";
import { getGmailClient } from "../auth/gmail-client.js";
import { loadConfig } from "../config.js";
import { appendMessages, loadMessages, nextSeq } from "../db/chat-messages.js";
import { touchConversation } from "../db/conversations.js";

const SYSTEM_PROMPT = `You are Gmail OS, an assistant that helps the user search, read, and manage their Gmail inbox.
Use the available tools to look up real data before answering questions about the user's email - never invent
message content, senders, or ids. When taking an action that changes mailbox state (send, reply, archive, trash,
label, delete), briefly confirm what you did in your final reply.

Keep replies short and lead with the answer. The UI renders the underlying emails, threads, and attachments as
its own expandable cards, so do NOT paste raw tool output into your reply: no full message bodies, no attachment
IDs, no base64, no long id strings, no reproduced email headers. Refer to a message by its subject and sender and
let the card carry the detail. A few sentences or a short list is usually enough.`;

const MAX_TOOL_ITERATIONS = 8;

export interface ChatLoopArgs {
  userId: string;
  conversationId: string;
  message: string;
}

export async function* runChatLoop({
  userId,
  conversationId,
  message,
}: ChatLoopArgs): AsyncGenerator<ChatEvent> {
  try {
    const config = loadConfig();
    const client = getLlmClient();

    const stored = await loadMessages(conversationId);
    const history: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...stored.map((s) => s.message),
    ];

    let seq = await nextSeq(conversationId);
    const userMessage: ChatCompletionMessageParam = { role: "user", content: message };
    history.push(userMessage);
    seq = await appendMessages(conversationId, seq, [userMessage]);

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const stream = await client.chat.completions.create({
        model: config.openRouter.model,
        messages: history,
        tools: openAiTools,
        tool_choice: "auto",
        stream: true,
      });

      let textContent = "";
      const toolCallsByIndex = new Map<
        number,
        { id: string; name: string; arguments: string }
      >();
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;
        const delta = choice.delta;

        if (delta?.content) {
          textContent += delta.content;
          yield { type: "text", data: { delta: delta.content } };
        }

        for (const toolCallDelta of delta?.tool_calls ?? []) {
          const index = toolCallDelta.index;
          const existing = toolCallsByIndex.get(index) ?? { id: "", name: "", arguments: "" };
          if (toolCallDelta.id) existing.id = toolCallDelta.id;
          if (toolCallDelta.function?.name) existing.name += toolCallDelta.function.name;
          if (toolCallDelta.function?.arguments) existing.arguments += toolCallDelta.function.arguments;
          toolCallsByIndex.set(index, existing);
        }

        if (choice.finish_reason) finishReason = choice.finish_reason;
      }

      const toolCalls = [...toolCallsByIndex.values()];

      if (finishReason !== "tool_calls" || toolCalls.length === 0) {
        const assistantMessage: ChatCompletionMessageParam = {
          role: "assistant",
          content: textContent,
        };
        history.push(assistantMessage);
        await appendMessages(conversationId, seq, [assistantMessage]);
        await touchConversation(conversationId);
        yield { type: "done", data: {} };
        return;
      }

      const assistantMessage: ChatCompletionMessageParam = {
        role: "assistant",
        content: textContent || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
      history.push(assistantMessage);

      const gmail = await getGmailClient(userId);
      const toolMessages: ChatCompletionMessageParam[] = [];

      for (const tc of toolCalls) {
        let input: unknown = {};
        try {
          input = tc.arguments ? JSON.parse(tc.arguments) : {};
        } catch {
          // fall through with empty input; the handler's zod parse will surface a clear error
        }

        yield { type: "tool_call", data: { tool: tc.name, input } };

        let resultPayload;
        try {
          resultPayload = await dispatchTool(gmail, tc.name, input);
        } catch (err) {
          const errMessage = err instanceof Error ? err.message : String(err);
          resultPayload = { kind: "raw" as const, data: { error: errMessage } };
        }

        yield { type: "tool_result", data: { tool: tc.name, result: resultPayload } };

        const toolMessage: ChatCompletionMessageParam = {
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(resultPayload),
        };
        history.push(toolMessage);
        toolMessages.push(toolMessage);
      }

      seq = await appendMessages(conversationId, seq, [assistantMessage, ...toolMessages]);
    }

    await touchConversation(conversationId);
    yield {
      type: "error",
      data: { message: "Reached maximum tool iterations without a final answer." },
    };
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    yield { type: "error", data: { message: errMessage } };
  }
}
