import { Mail, X } from "lucide-react";
import type { DashboardRow } from "@email-os/shared";

export function EvidenceDrawer({
  title,
  rows,
  onClose,
  onOpenThread,
}: {
  title: string;
  rows: DashboardRow[];
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
}) {
  const sources = [...new Map(rows.flatMap((row) => row.sources).map((source) => [source.threadId, source])).values()];

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-l border-border bg-sidebar lg:w-[360px]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Mail className="size-4 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">Source emails</h2>
          <p className="text-xs text-muted-foreground">{sources.length} conversation{sources.length === 1 ? "" : "s"} behind {title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close source emails"
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {sources.map((source) => (
          <button
            key={source.threadId}
            type="button"
            onClick={() => onOpenThread(source.threadId)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/45"
          >
            <span className="block truncate text-sm font-medium">{source.subject || "Untitled email"}</span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">{source.from}</span>
            <span className="mt-1.5 block text-[0.7rem] text-primary">Open conversation</span>
          </button>
        ))}
        {sources.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No source emails were recorded for this data point.
          </p>
        )}
      </div>
    </aside>
  );
}
