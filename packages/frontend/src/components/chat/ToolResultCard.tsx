import { useState } from "react";
import {
  ChevronRight,
  Mail,
  Loader2,
  MessagesSquare,
  Tag,
  Check,
  FileJson,
  Download,
  Paperclip,
} from "lucide-react";
import type { MessageDetail } from "@email-os/shared";
import type { ToolActivity } from "@/hooks/useChatStream";
import { getAttachmentUrl } from "@/lib/api";
import { formatBytes, displayName } from "@/lib/format";
import { EmailCard } from "./EmailCard";
import { SenderAvatar } from "./SenderAvatar";
import { MailModal } from "./MailModal";
import { Badge } from "@/components/ui/badge";

/**
 * A tool run is rendered as a single collapsed ledger row. Message and thread
 * results open a mail-client modal; everything else expands inline.
 */
export function ToolResultCard({
  activity,
  bare = false,
}: {
  activity: ToolActivity;
  /** Drop the card's own frame — used inside a grouped trace that supplies one. */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mail, setMail] = useState<{ title: string; messages: MessageDetail[] } | null>(null);
  const { tool, result } = activity;

  if (!result) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        <span>Running {prettyTool(tool)}…</span>
      </div>
    );
  }

  if (result.kind === "ack") {
    return (
      <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
        <Check className="size-3.5 text-emerald-400" />
        <span>{result.message}</span>
      </div>
    );
  }

  // A fetched attachment — offer it as a direct download rather than a blob dump.
  if (tool === "get_attachment" && result.kind === "raw") {
    const inp = (activity.input ?? {}) as { messageId?: string; attachmentId?: string; filename?: string; mime?: string };
    const size = (result.data as { size?: number })?.size;
    if (inp.messageId && inp.attachmentId) {
      const name = inp.filename || "attachment";
      return (
        <a
          href={getAttachmentUrl(inp.messageId, inp.attachmentId, name, inp.mime || "application/octet-stream")}
          download={name}
          className="group shadow-sm-x flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 transition-colors hover:border-primary/50"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
            <Paperclip className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{name}</span>
            {typeof size === "number" && (
              <span className="font-data block text-[0.65rem] text-muted-foreground">
                {formatBytes(size)} · ready to download
              </span>
            )}
          </span>
          <Download className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
        </a>
      );
    }
  }

  const meta = describe(tool, result);
  const opensModal = result.kind === "message" || result.kind === "thread";
  const headMsg =
    result.kind === "message"
      ? result.message
      : result.kind === "thread"
        ? result.thread.messages[result.thread.messages.length - 1]
        : null;

  const openModal = () => {
    if (result.kind === "message") {
      setMail({
        title: result.message.subject || "Message",
        messages: [result.message],
      });
    } else if (result.kind === "thread") {
      setMail({
        title: result.thread.messages[0]?.subject || "Thread",
        messages: result.thread.messages,
      });
    }
  };

  return (
    <div
      className={
        bare
          ? "group"
          : "shadow-sm-x group overflow-hidden rounded-lg border border-border bg-card"
      }
    >
      <button
        type="button"
        onClick={opensModal ? openModal : () => setOpen((v) => !v)}
        aria-expanded={opensModal ? undefined : open}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {opensModal && headMsg ? (
          <>
            <SenderAvatar from={headMsg.from} className="size-4 text-[0.6rem]" />
            <span className="truncate text-foreground/90">
              {displayName(headMsg.from)}
              {headMsg.subject && (
                <span className="text-muted-foreground"> — {headMsg.subject}</span>
              )}
            </span>
          </>
        ) : (
          <>
            <ChevronRight
              className={`size-3.5 shrink-0 text-muted-foreground/60 transition-transform ${open ? "rotate-90" : ""}`}
            />
            <span className="text-muted-foreground/80">{meta.icon}</span>
            <span className="truncate">
              {meta.tool}
              {meta.count != null && (
                <span className="font-data ml-1.5 text-muted-foreground/70">{meta.count}</span>
              )}
            </span>
          </>
        )}
        <span className="label-eq ml-auto shrink-0 text-[0.62rem] text-muted-foreground/50 group-hover:text-muted-foreground">
          {opensModal ? "Open" : open ? "Hide" : "View"}
        </span>
      </button>

      {!opensModal && open && (
        <div className="space-y-2 border-t border-border bg-background/40 p-2.5">
          {renderBody(result)}
        </div>
      )}

      {mail && (
        <MailModal title={mail.title} messages={mail.messages} onClose={() => setMail(null)} />
      )}
    </div>
  );
}

function renderBody(result: NonNullable<ToolActivity["result"]>) {
  switch (result.kind) {
    case "messages":
      return result.messages.map((m) => <EmailCard key={m.id} message={m} />);
    case "threads":
      return result.threads.map((t) => (
        <div key={t.id} className="rounded-md border border-border bg-card/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-data truncate text-xs text-muted-foreground">{t.id}</p>
            <span className="font-data shrink-0 text-[0.7rem] text-muted-foreground">
              {t.messageCount || "?"} msgs
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{t.snippet}</p>
        </div>
      ));
    case "labels":
      return (
        <div className="flex flex-wrap gap-1">
          {result.labels.map((l) => (
            <Badge key={l.id} variant="outline" className="border-strong">
              {l.name}
            </Badge>
          ))}
        </div>
      );
    case "raw":
    default:
      return (
        <pre className="font-data max-h-72 overflow-auto rounded-md border border-border bg-background p-3 text-xs whitespace-pre-wrap">
          {JSON.stringify((result as { data: unknown }).data, null, 2)}
        </pre>
      );
  }
}

function describe(tool: string, result: NonNullable<ToolActivity["result"]>) {
  const t = prettyTool(tool);
  const icon = "size-3.5 shrink-0";
  switch (result.kind) {
    case "messages":
      return { tool: t, count: count(result.messages.length, "email"), icon: <Mail className={icon} /> };
    case "message":
      return { tool: t, count: "1 email", icon: <Mail className={icon} /> };
    case "threads":
      return { tool: t, count: count(result.threads.length, "thread"), icon: <MessagesSquare className={icon} /> };
    case "thread":
      return { tool: t, count: count(result.thread.messages.length, "message"), icon: <MessagesSquare className={icon} /> };
    case "labels":
      return { tool: t, count: count(result.labels.length, "label"), icon: <Tag className={icon} /> };
    default:
      return { tool: t, count: null as string | null, icon: <FileJson className={icon} /> };
  }
}

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function prettyTool(tool: string) {
  return tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
