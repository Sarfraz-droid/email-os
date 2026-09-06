import type { DashboardSpec } from "@email-os/shared";
import { defaultLayout, reconcileLayout } from "@email-os/shared";
import { getLlmClient } from "../agent/llm-client.js";
import { loadConfig } from "../config.js";
import { parseSpec, pruneInvalidComponents, validateSpecReferences } from "./spec-schema.js";

const SYSTEM_PROMPT = `You design "generative dashboards" over a Gmail inbox. The user describes a
dashboard in plain language; you output ONE JSON object — a DashboardSpec — and nothing else.

The spec is executed deterministically: its \`sourceQuery\` runs as a Gmail search, each matching
message is passed to a structured-extraction model that fills \`entity.schema\` (or returns nothing
if the message is not a real instance of the entity), rows are de-duplicated by \`entity.keyFields\`,
and \`components\` are rendered from those rows on a draggable 12-column grid.

Output rules:
- Strictly valid JSON. No markdown fences, no prose.
- "version" is always 1.
- sourceQuery uses real Gmail search syntax (from:, subject:, OR, newer_than:, has:, "quoted phrases").
  Broad enough to catch the relevant mail, narrow enough to exclude the rest. Include "newer_than:1y"
  unless the user asks for all-time.
- maxMessages: 40-80.
- entity.schema: an ARRAY of 4-12 field objects, names snake_case. Each field's \`type\` is exactly
  one of: string | number | currency | date | enum | boolean  (never "text", "int", "datetime").
  Every field gets a one-line \`description\` written as an instruction to the extraction model.
  Use "enum" with \`enumValues\` (lowercase) for fixed sets of states.
- keyFields: the minimal set identifying one real-world entity across many emails.

Components — RELEVANCE IS MANDATORY:
- 3-6 components. Every component must earn its place and must ONLY reference fields you defined in
  entity.schema (or the implicit "_lastMessageDate"). Do not invent decorative charts.
- All components describe the same entity set. A KPI label must name exactly what it counts: never
  call application rows "companies", and make any narrower filter explicit in its label.
- Compare KPIs and funnels before returning: totals may differ only when their stated filters differ.
- Each component has a unique \`id\` (short slug, e.g. "active-count", "pipeline", "by-company").
- Types:
  - "kpi"     : one number. {id,label,agg:count|sum|avg|min|max, field?, where?, unit?}
  - "table"   : {id, columns:[{field,label,format}], sortBy?, sortDir?, where?}
                format = text|number|currency|date|relative-date|badge
  - "funnel"  : {id, field:<enum field>, stages:[...] top-of-funnel first}
  - "timeline": {id, dateField, labelField}
  - "barlist" : {id, groupBy, agg:count|sum, field?, limit?}
  - "column"  : {id, groupBy, agg:count|sum, field?, limit?}; use for a clear visual comparison of 3–8 categories.
- filters ({field,op,value}) op = eq|ne|gt|gte|lt|lte|contains|in|exists|older_than_days|newer_than_days.
  "in" takes an array; "*_days" take a number; "exists" takes no value.
- rowFlags (optional): [{name, where:[...], tone: ok|warn|danger}] to highlight table rows
  (e.g. "stale" applications).
- filters (recommended): choose 1–4 useful, low-cardinality fields users will want to explore
  (e.g. application stage, payment method, transaction type). Each is {field, label?}. Only include
  fields you defined in entity.schema. Do not add decorative or high-cardinality filters.

Layout:
- Include a "layout" array: one {i,x,y,w,h} per component id on a 12-col grid. Use the exact
  proportions: KPIs w:3,h:3 across the top; tables w:12,h:8; funnel/barlist/column w:6,h:7;
  timeline w:6,h:9. Keep tiles non-overlapping and aligned in clean rows; never oversize a KPI.

Return only the JSON object.`;

const REPAIR_PROMPT = `Your JSON does not satisfy the DashboardSpec contract. Return the corrected object
ONLY — strictly valid JSON, no prose. Reminders: "entity.schema" is an ARRAY; every top-level key
(version, title, sourceQuery, maxMessages, entity, components) must be present; every component needs
a unique "id"; components may reference ONLY fields declared in entity.schema (or "_lastMessageDate").`;

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return (fenced ? fenced[1]! : trimmed).trim();
}

function unwrap(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of ["spec", "dashboard", "dashboardSpec", "DashboardSpec"]) {
      if (obj[key] && typeof obj[key] === "object" && !("version" in obj)) return obj[key];
    }
  }
  return value;
}

function parseJson(text: string): unknown {
  return unwrap(JSON.parse(stripFences(text)));
}

async function callModel(
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): Promise<string> {
  const client = getLlmClient();
  const { openRouter } = loadConfig();
  const completion = await client.chat.completions.create({
    model: openRouter.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages,
  });
  return completion.choices[0]?.message?.content ?? "";
}

/** Ensures the spec is renderable: prune dangling refs, then guarantee a layout. */
export function finalizeSpec(spec: DashboardSpec): DashboardSpec {
  pruneInvalidComponents(spec);
  spec.layout =
    spec.layout && spec.layout.length
      ? reconcileLayout(spec, spec.layout)
      : defaultLayout(spec);
  return spec;
}

export async function generateSpec(prompt: string): Promise<DashboardSpec> {
  const base = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: `Build a dashboard for this request:\n\n"${prompt.trim()}"` },
  ];

  const first = await callModel(base);
  if (!first.trim()) throw new Error("The model returned an empty dashboard spec.");

  const attempt = (text: string): DashboardSpec => {
    const spec = parseSpec(parseJson(text));
    const issues = validateSpecReferences(spec);
    if (issues.length) {
      const err = new Error(
        `components reference undefined fields: ${issues
          .map((i) => `${i.component} → ${i.badFields.join(", ")}`)
          .join("; ")}`
      );
      (err as { retryable?: boolean }).retryable = true;
      throw err;
    }
    return spec;
  };

  try {
    return finalizeSpec(attempt(first));
  } catch (firstErr) {
    const detail = firstErr instanceof Error ? firstErr.message : String(firstErr);
    let repaired: string;
    try {
      repaired = await callModel([
        ...base,
        { role: "assistant", content: first },
        { role: "user", content: `${REPAIR_PROMPT}\n\nProblem:\n${detail}` },
      ]);
    } catch {
      throw new Error(`The generated dashboard spec was not valid: ${detail}`);
    }
    try {
      return finalizeSpec(attempt(repaired));
    } catch (secondErr) {
      // Structure is fine but some refs are still dangling — prune and ship.
      try {
        const spec = parseSpec(parseJson(repaired));
        return finalizeSpec(spec);
      } catch {
        const d2 = secondErr instanceof Error ? secondErr.message : String(secondErr);
        throw new Error(`The generated dashboard spec was not valid: ${d2}`);
      }
    }
  }
}
