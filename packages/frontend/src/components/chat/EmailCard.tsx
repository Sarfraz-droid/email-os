import { ExternalLink } from "lucide-react";
import type { MessageSummary } from "@email-os/shared";
import { Badge } from "@/components/ui/badge";
import { decodeEntities } from "@/lib/format";

export function EmailCard({ message }: { message: MessageSummary }) {
  return (
    <div className="group rounded-md border border-border bg-card/60 px-3 py-2.5 transition-colors hover:border-strong hover:bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{message.subject || "(no subject)"}</p>
          <p className="truncate text-xs text-muted-foreground">{decodeEntities(message.from)}</p>
        </div>
        {message.unread && (
          <Badge
            variant="secondary"
            className="label-eq shrink-0 bg-primary/15 text-[0.6rem] text-primary"
          >
            Unread
          </Badge>
        )}
      </div>
      {message.snippet && (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
          {decodeEntities(message.snippet)}
        </p>
      )}
      <a
        href={`https://mail.google.com/mail/u/0/#all/${message.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
      >
        Open in Gmail
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}
