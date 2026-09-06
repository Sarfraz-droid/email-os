import type { gmail_v1 } from "googleapis";
import type { AttachmentRef } from "@email-os/shared";

export function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

export function encodeBase64Url(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  return buf.toString("base64url");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  const header = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? "";
}

interface CollectedBody {
  bodyText: string;
  bodyHtml?: string;
  attachments: AttachmentRef[];
}

const MAX_BODY_CHARS = 20_000;

export function collectBody(payload: gmail_v1.Schema$MessagePart | undefined): CollectedBody {
  let bodyText = "";
  let bodyHtml: string | undefined;
  const attachments: AttachmentRef[] = [];

  function walk(part: gmail_v1.Schema$MessagePart | undefined) {
    if (!part) return;

    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? 0,
      });
      return;
    }

    if (part.mimeType === "text/plain" && part.body?.data) {
      bodyText += decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data) {
      bodyHtml = (bodyHtml ?? "") + decodeBase64Url(part.body.data);
    }

    for (const child of part.parts ?? []) {
      walk(child);
    }
  }

  walk(payload);

  if (!bodyText && bodyHtml) {
    bodyText = stripHtml(bodyHtml);
  }

  return {
    bodyText: bodyText.slice(0, MAX_BODY_CHARS),
    bodyHtml,
    attachments,
  };
}

export interface BuildMimeParams {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
}

export function buildRawMime(params: BuildMimeParams): string {
  const lines: string[] = [];
  lines.push(`To: ${params.to.join(", ")}`);
  if (params.cc?.length) lines.push(`Cc: ${params.cc.join(", ")}`);
  if (params.bcc?.length) lines.push(`Bcc: ${params.bcc.join(", ")}`);
  lines.push(`Subject: ${params.subject}`);
  if (params.inReplyTo) lines.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) lines.push(`References: ${params.references}`);
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("");
  lines.push(params.bodyText);

  return encodeBase64Url(lines.join("\r\n"));
}
