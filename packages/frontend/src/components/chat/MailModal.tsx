import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Download,
  FileText,
  Image as ImageIcon,
  FileArchive,
  File,
  Paperclip,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import type { MessageDetail, AttachmentRef } from "@email-os/shared";
import { getAttachmentUrl } from "@/lib/api";
import { formatBytes, displayName } from "@/lib/format";
import { SenderAvatar } from "./SenderAvatar";

/**
 * A message or full thread opened the way a mail client shows it — stacked
 * message panels with real headers, complete bodies, and downloadable
 * attachments. Rendered in a portal as a modal dialog.
 */
export function MailModal({
  title,
  messages,
  onClose,
}: {
  title: string;
  messages: MessageDetail[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-in flex h-svh w-full flex-col overflow-hidden border-strong bg-popover shadow-pop-x sm:my-auto sm:h-auto sm:max-h-[86vh] sm:max-w-2xl sm:rounded-2xl sm:border"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="mark size-4 shrink-0" aria-hidden />
            <p className="truncate text-sm font-semibold tracking-tight">{title}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
          {messages.map((m, i) => (
            <MessagePanel
              key={m.id}
              message={m}
              defaultOpen={i === messages.length - 1}
              collapsible={messages.length > 1}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

function MessagePanel({
  message,
  defaultOpen,
  collapsible,
}: {
  message: MessageDetail;
  defaultOpen: boolean;
  collapsible: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Collapse the runs of blank lines Gmail's plain-text bodies are full of.
  const body = (message.bodyText || "").replace(/\n{3,}/g, "\n\n").trim();

  const header = (
    <>
      <SenderAvatar from={message.from} className="mt-0.5 size-8 text-xs" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{displayName(message.from)}</span>
          <span className="font-data shrink-0 text-[0.7rem] text-muted-foreground">
            {formatDate(message.date)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          to {displayName(message.to) || "you"}
        </span>
      </span>
      {collapsible && (
        <ChevronDown
          className={`mt-1 size-4 shrink-0 text-muted-foreground/60 transition-transform ${open ? "rotate-180" : ""}`}
        />
      )}
    </>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
        >
          {header}
        </button>
      ) : (
        <div className="flex w-full items-start gap-3 px-3.5 py-3 text-left">{header}</div>
      )}

      {open && (
        <div className="space-y-4 border-t border-border px-3.5 py-3.5">
          {message.subject && (
            <p className="text-[0.95rem] leading-snug font-semibold tracking-tight">
              {message.subject}
            </p>
          )}

          {body ? (
            <p className="text-[0.85rem] leading-relaxed whitespace-pre-wrap text-foreground/90">
              {body}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">This message has no text body.</p>
          )}

          {message.attachments.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="label-eq flex items-center gap-1.5 text-muted-foreground/70">
                <Paperclip className="size-3" />
                {message.attachments.length} attachment
                {message.attachments.length === 1 ? "" : "s"}
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {message.attachments.map((a) => (
                  <AttachmentRow key={a.attachmentId} messageId={message.id} attachment={a} />
                ))}
              </div>
            </div>
          )}

          <a
            href={`https://mail.google.com/mail/u/0/#all/${message.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 border-t border-border pt-3 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            Open in Gmail
            <ExternalLink className="size-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function AttachmentRow({
  messageId,
  attachment,
}: {
  messageId: string;
  attachment: AttachmentRef;
}) {
  return (
    <a
      href={getAttachmentUrl(messageId, attachment.attachmentId, attachment.filename, attachment.mimeType)}
      download={attachment.filename || "attachment"}
      className="group flex items-center gap-2.5 rounded-lg border border-strong bg-background px-2.5 py-2 transition-colors hover:border-primary/50 hover:bg-card"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
        <AttachmentIcon mime={attachment.mimeType} name={attachment.filename} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">
          {attachment.filename || "attachment"}
        </span>
        <span className="font-data block text-[0.65rem] text-muted-foreground">
          {shortType(attachment.mimeType)} · {formatBytes(attachment.size)}
        </span>
      </span>
      <Download className="size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
    </a>
  );
}

/* ── helpers ──────────────────────────────────────────────────────── */

function AttachmentIcon({ mime, name }: { mime: string; name: string }) {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  const cls = "size-4";
  if (m.startsWith("image/")) return <ImageIcon className={cls} />;
  if (m.includes("pdf") || n.endsWith(".pdf")) return <FileText className={cls} />;
  if (m.includes("zip") || m.includes("compressed") || /\.(zip|rar|7z|tar|gz)$/.test(n))
    return <FileArchive className={cls} />;
  if (m.startsWith("text/") || /\.(txt|md|csv|json|xml|html?)$/.test(n))
    return <FileText className={cls} />;
  return <File className={cls} />;
}

function shortType(mime: string) {
  if (!mime) return "FILE";
  const sub = mime.split("/")[1] ?? mime;
  return sub.split(/[.+]/).pop()!.toUpperCase().slice(0, 8);
}

function formatDate(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
