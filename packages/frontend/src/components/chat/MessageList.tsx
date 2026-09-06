import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/hooks/useChatStream";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/lib/markdown";
import { ToolTrace } from "./ToolTrace";

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <ScrollArea className="min-h-0 flex-1 px-3 sm:px-4">
      <div className="mx-auto flex max-w-xl flex-col gap-6 py-6 sm:gap-8 sm:py-8">
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} id={`msg-${message.id}`} className="msg-in flex scroll-mt-20 justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md border border-primary/25 bg-primary/12 px-3.5 py-2.5 text-sm whitespace-pre-wrap text-foreground shadow-sm-x">
                {message.text}
              </div>
            </div>
          ) : (
            <div key={message.id} className="msg-in flex gap-3">
              <span className="mark mt-1 size-[18px] shrink-0" aria-hidden />
              <div className="min-w-0 flex-1 space-y-3 pt-0.5">
                {message.tools.length > 0 && <ToolTrace tools={message.tools} />}
                {message.text ? (
                  <Markdown text={message.text} />
                ) : (
                  !message.error && message.tools.length === 0 && <ThinkingDots />
                )}
                {message.error && (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {message.error}
                  </p>
                )}
              </div>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1.5" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-full bg-primary/70"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}
