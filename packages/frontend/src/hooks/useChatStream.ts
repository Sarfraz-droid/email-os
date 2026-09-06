import { useCallback, useRef, useState } from "react";
import type { ConversationSummary, UiChatMessage } from "@email-os/shared";
import { getConversation, streamChat } from "@/lib/api";

export type { ToolActivity } from "@email-os/shared";
/** Kept as a local alias so existing imports (`@/hooks/useChatStream`) still resolve. */
export type ChatMessage = UiChatMessage;

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

interface Options {
  /** Called when a brand-new conversation is created by the first message of a turn. */
  onConversationCreated?: (summary: { id: string; title: string }) => void;
}

export function useChatStream(options: Options = {}) {
  const { onConversationCreated } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  const setActiveConversation = (id: string | null) => {
    conversationIdRef.current = id;
    setConversationId(id);
  };

  const sendMessage = useCallback(
    async (text: string) => {
      const userMessage: ChatMessage = { id: makeId(), role: "user", text, tools: [] };
      const assistantId = makeId();
      const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", text: "", tools: [] };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      const controller = new AbortController();
      controllerRef.current = controller;

      const updateAssistant = (updater: (msg: ChatMessage) => ChatMessage) => {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)));
      };

      try {
        await streamChat(
          text,
          conversationIdRef.current,
          (event) => {
            switch (event.type) {
              case "conversation":
                setActiveConversation(event.data.id);
                onConversationCreated?.(event.data);
                break;
              case "text":
                updateAssistant((m) => ({ ...m, text: m.text + event.data.delta }));
                break;
              case "tool_call":
                updateAssistant((m) => ({
                  ...m,
                  tools: [...m.tools, { tool: event.data.tool, input: event.data.input }],
                }));
                break;
              case "tool_result":
                updateAssistant((m) => ({
                  ...m,
                  tools: m.tools.map((t) =>
                    t.tool === event.data.tool && !t.result ? { ...t, result: event.data.result } : t
                  ),
                }));
                break;
              case "error":
                updateAssistant((m) => ({ ...m, error: event.data.message }));
                break;
              case "done":
                break;
            }
          },
          controller.signal
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateAssistant((m) => ({ ...m, error: message }));
      } finally {
        setIsStreaming(false);
      }
    },
    [onConversationCreated]
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  /** Start a fresh, unsaved conversation. */
  const startNew = useCallback(() => {
    controllerRef.current?.abort();
    setMessages([]);
    setActiveConversation(null);
    setIsStreaming(false);
  }, []);

  /** Load an existing conversation's transcript from the server. */
  const openConversation = useCallback(async (summary: ConversationSummary) => {
    controllerRef.current?.abort();
    setIsStreaming(false);
    setActiveConversation(summary.id);
    setMessages([]);
    try {
      const { messages: loaded } = await getConversation(summary.id);
      // Guard against a race where the user switched again mid-fetch.
      if (conversationIdRef.current === summary.id) setMessages(loaded);
    } catch {
      if (conversationIdRef.current === summary.id) {
        setMessages([
          { id: makeId(), role: "assistant", text: "", tools: [], error: "Couldn't load this conversation." },
        ]);
      }
    }
  }, []);

  return {
    messages,
    conversationId,
    isStreaming,
    sendMessage,
    stop,
    startNew,
    openConversation,
  };
}
