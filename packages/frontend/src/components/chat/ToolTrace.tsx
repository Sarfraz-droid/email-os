import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import type { ToolActivity } from "@/hooks/useChatStream";
import { ToolResultCard } from "./ToolResultCard";

/**
 * A turn can fan out into a dozen tool runs. Two or fewer render inline; beyond
 * that they fold into one summary line so the assistant's answer stays the
 * focus. The trace stays open while the turn is still running, then tucks away.
 */
const INLINE_LIMIT = 2;

export function ToolTrace({ tools }: { tools: ToolActivity[] }) {
  const running = tools.some((t) => !t.result);
  const [open, setOpen] = useState(running);
  const wasRunning = useRef(running);

  // Collapse once the last tool resolves; leave user toggles alone afterwards.
  useEffect(() => {
    if (wasRunning.current && !running) setOpen(false);
    wasRunning.current = running;
  }, [running]);

  if (tools.length === 0) return null;

  if (tools.length <= INLINE_LIMIT) {
    return (
      <div className="space-y-1.5">
        {tools.map((activity, i) => (
          <ToolResultCard key={`${activity.tool}-${i}`} activity={activity} />
        ))}
      </div>
    );
  }

  return (
    <div className="shadow-sm-x overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {running ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
        ) : (
          <ChevronRight
            className={`size-3.5 shrink-0 text-muted-foreground/60 transition-transform ${open ? "rotate-90" : ""}`}
          />
        )}
        <span className="truncate">
          {running ? "Working" : `${tools.length} steps`}
          <span className="font-data ml-1.5 text-muted-foreground/70">{summarize(tools)}</span>
        </span>
        <span className="label-eq ml-auto shrink-0 text-[0.62rem] text-muted-foreground/50">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-border border-t border-border bg-background/40">
          {tools.map((activity, i) => (
            <li key={`${activity.tool}-${i}`} className="px-1">
              <ToolResultCard activity={activity} bare />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const GROUPS: { test: (t: string) => boolean; label: (n: number) => string }[] = [
  { test: (t) => t.startsWith("search_"), label: (n) => `searched ${n}` },
  { test: (t) => t === "get_message" || t === "get_thread", label: (n) => `opened ${n}` },
  { test: (t) => t === "get_attachment", label: (n) => `${n} attachment${n === 1 ? "" : "s"}` },
  { test: (t) => t.startsWith("list_"), label: (n) => `listed ${n}` },
];

function summarize(tools: ToolActivity[]): string {
  const counts = GROUPS.map(() => 0);
  let other = 0;
  for (const t of tools) {
    const idx = GROUPS.findIndex((g) => g.test(t.tool));
    if (idx === -1) other += 1;
    else counts[idx] += 1;
  }
  const parts = GROUPS.map((g, i) => (counts[i] ? g.label(counts[i]) : null)).filter(Boolean);
  if (other) parts.push(`${other} more`);
  return parts.join(" · ");
}
