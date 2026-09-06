import type { DashboardRow, DashboardSpec, MessageDetail } from "@email-os/shared";
import type { ExtractionOutput } from "./extractor.js";

const SEP = "␟";

/** Legal / organisational suffixes that shouldn't split one entity into two. */
const NOISE =
  /\b(inc|incorporated|corp|corporation|co|company|llc|l\.l\.c|ltd|limited|plc|gmbh|ag|sa|pvt|private|technologies|technology|tech|labs|inc\.?|group|holdings|solutions|systems|software)\b/g;

/** Collapses "Acme Corp." / "the Acme, Inc" / "ACME" to a single stable token. */
export function normalizeKeyValue(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/^\s*the\s+/, "")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function entityKey(spec: DashboardSpec, entity: Record<string, unknown>): string {
  return spec.entity.keyFields.map((f) => normalizeKeyValue(entity[f])).join(SEP);
}

function messageDate(m: MessageDetail): string {
  const t = new Date(m.date).getTime();
  return Number.isNaN(t) ? new Date(0).toISOString() : new Date(t).toISOString();
}

/**
 * Folds freshly extracted entities into the existing row set.
 *
 * - Rows are keyed by `entityKey`.
 * - When a newer message contributes a value it wins; older messages only fill
 *   fields that are still empty.
 * - `sources` accumulate (deduped by message id); `lastMessageDate` is the max.
 */
export function resolveRows(
  spec: DashboardSpec,
  existing: DashboardRow[],
  extracted: ExtractionOutput[]
): DashboardRow[] {
  const byKey = new Map<string, DashboardRow>();
  for (const row of existing) byKey.set(row.key, structuredClone(row));

  for (const { message, entity } of extracted) {
    if (!entity) continue;
    const key = entityKey(spec, entity);
    if (!key.replace(new RegExp(SEP, "g"), "")) continue;

    const date = messageDate(message);
    const source = {
      messageId: message.id,
      threadId: message.threadId,
      subject: message.subject,
      from: message.from,
      date,
    };

    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, {
        key,
        fields: { ...entity },
        sources: [source],
        lastMessageDate: date,
      });
      continue;
    }

    const isNewer = date >= current.lastMessageDate;
    for (const [k, v] of Object.entries(entity)) {
      if (v == null || v === "") continue;
      if (isNewer || current.fields[k] == null || current.fields[k] === "") {
        current.fields[k] = v;
      }
    }
    if (!current.sources.some((s) => s.messageId === source.messageId)) {
      current.sources.push(source);
    }
    if (date > current.lastMessageDate) current.lastMessageDate = date;
  }

  return [...byKey.values()].sort((a, b) =>
    b.lastMessageDate.localeCompare(a.lastMessageDate)
  );
}
