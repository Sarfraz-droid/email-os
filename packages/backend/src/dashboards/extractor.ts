import type { DashboardField, DashboardSpec, MessageDetail } from "@email-os/shared";
import { getLlmClient } from "../agent/llm-client.js";
import { loadConfig } from "../config.js";

/** Messages per extraction request. Keeps prompts well under context limits. */
const BATCH_SIZE = 5;
/** Body characters kept per message. */
const BODY_CLIP = 4000;

export type ExtractedEntity = Record<string, unknown>;

function fieldLine(f: DashboardField): string {
  const enumPart =
    f.type === "enum" && f.enumValues?.length
      ? ` (one of: ${f.enumValues.join(", ")})`
      : "";
  return `- ${f.name} [${f.type}]${enumPart}: ${f.description}`;
}

function buildSystemPrompt(spec: DashboardSpec): string {
  return `You extract structured "${spec.entity.name}" records from Gmail messages for a dashboard
titled "${spec.title}".

For EACH message you are given, decide whether it actually represents a "${spec.entity.name}".
If it does, return an object with these fields (omit a field only when the message genuinely
does not state it — never guess):
${spec.entity.schema.map(fieldLine).join("\n")}

If the message is NOT a "${spec.entity.name}" (newsletter, unrelated notification, marketing),
return null for it.

Respond with strict JSON: {"results": [ <object|null>, ... ]} where results[i] corresponds to
messages[i], in order. No prose, no markdown.
- date fields: ISO 8601 (YYYY-MM-DD).
- currency/number fields: bare numbers, no symbols or thousands separators.
- enum fields: exactly one of the listed values, lowercase.
- boolean fields: true/false.`;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…[truncated]` : s;
}

function messageBlock(m: MessageDetail, index: number): string {
  return [
    `--- messages[${index}] ---`,
    `From: ${m.from}`,
    `Date: ${m.date}`,
    `Subject: ${m.subject}`,
    "",
    clip(m.bodyText || m.snippet || "", BODY_CLIP),
  ].join("\n");
}

function coerce(value: unknown, field: DashboardField): unknown {
  if (value == null || value === "") return undefined;
  switch (field.type) {
    case "number":
    case "currency": {
      if (typeof value === "number") return value;
      const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      return /^(true|yes|1)$/i.test(String(value));
    case "enum": {
      const v = String(value).trim().toLowerCase();
      if (field.enumValues && !field.enumValues.includes(v)) {
        // Best-effort: match on prefix, else keep raw so it's still visible.
        const hit = field.enumValues.find((e) => e.startsWith(v) || v.startsWith(e));
        return hit ?? v;
      }
      return v;
    }
    case "date": {
      const t = new Date(String(value));
      return Number.isNaN(t.getTime()) ? String(value) : t.toISOString().slice(0, 10);
    }
    default:
      return String(value);
  }
}

function normalizeRow(raw: unknown, spec: DashboardSpec): ExtractedEntity | null {
  if (raw == null || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: ExtractedEntity = {};
  for (const field of spec.entity.schema) {
    const coerced = coerce(src[field.name], field);
    if (coerced !== undefined) out[field.name] = coerced;
  }
  // A row with no key-field values is unusable for de-duplication.
  const hasKey = spec.entity.keyFields.some((k) => out[k] != null && out[k] !== "");
  return hasKey ? out : null;
}

async function extractBatch(
  spec: DashboardSpec,
  batch: MessageDetail[]
): Promise<(ExtractedEntity | null)[]> {
  const client = getLlmClient();
  const { openRouter } = loadConfig();

  const completion = await client.chat.completions.create({
    model: openRouter.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt(spec) },
      {
        role: "user",
        content: batch.map((m, i) => messageBlock(m, i)).join("\n\n"),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return batch.map(() => null);
  }
  const results = (parsed as { results?: unknown[] })?.results;
  if (!Array.isArray(results)) return batch.map(() => null);

  return batch.map((_, i) => normalizeRow(results[i], spec));
}

export interface ExtractionOutput {
  message: MessageDetail;
  entity: ExtractedEntity | null;
}

/**
 * Runs extraction over `messages` in small batches. Batches run sequentially to
 * stay friendly to rate limits; order is preserved.
 */
export async function extractEntities(
  spec: DashboardSpec,
  messages: MessageDetail[],
  onProgress?: (done: number, total: number) => void
): Promise<ExtractionOutput[]> {
  const out: ExtractionOutput[] = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    let entities: (ExtractedEntity | null)[];
    try {
      entities = await extractBatch(spec, batch);
    } catch {
      entities = batch.map(() => null);
    }
    batch.forEach((message, j) => out.push({ message, entity: entities[j] ?? null }));
    onProgress?.(Math.min(i + BATCH_SIZE, messages.length), messages.length);
  }
  return out;
}
