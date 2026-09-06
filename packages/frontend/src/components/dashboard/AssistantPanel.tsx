import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import type { DashboardView } from "@email-os/shared";
import { askDashboardAssistant } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Msg {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}

const CHIPS = [
  "Add a KPI for offers received",
  "Group the table by stage",
  "Make the table full width and taller",
  "Add a bar chart of applications by company",
  "Add a column chart that compares spending by merchant",
  "Only show applications from the last 30 days",
];

export function AssistantPanel({
  dashboardId,
  onClose,
  onUpdated,
}: {
  dashboardId: string;
  onClose: () => void;
  onUpdated: (view: DashboardView) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Tell me how to change this dashboard — add or remove tiles, retitle, re-filter, or rearrange the layout.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setInput("");
    setBusy(true);
    try {
      const res = await askDashboardAssistant(dashboardId, trimmed);
      setMessages((m) => [...m, { role: "assistant", text: res.reply }]);
      if (res.changed) onUpdated(res.dashboard);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: err instanceof Error ? err.message : "Something went wrong.",
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-l border-border bg-sidebar lg:w-[360px]">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="size-4 text-primary" />
        <span className="font-heading text-sm font-medium">Layout assistant</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close assistant"
          className="ml-auto"
        >
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[92%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary/15 text-foreground"
                : m.error
                  ? "bg-destructive/10 text-destructive"
                  : "bg-card text-foreground/90 ring-1 ring-foreground/10"
            }`}
          >
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Rewriting the dashboard…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {CHIPS.map((c) => (
            <Button
              key={c}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => send(c)}
              className="h-auto min-h-6 rounded-md py-1 text-left text-[0.7rem] text-muted-foreground"
            >
              {c}
            </Button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex shrink-0 items-end gap-2 border-t border-border p-3"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder="Describe a change…"
          className="min-h-10 flex-1 resize-none"
        />
        <Button
          type="submit"
          size="icon-lg"
          disabled={busy || !input.trim()}
          className="shrink-0"
          aria-label="Send"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </form>
    </aside>
  );
}
