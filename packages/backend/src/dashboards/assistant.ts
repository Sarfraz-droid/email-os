import type { DashboardSpec } from "@email-os/shared";
import { getLlmClient } from "../agent/llm-client.js";
import { loadConfig } from "../config.js";
import { finalizeSpec } from "./spec-generator.js";
import { parseSpec } from "./spec-schema.js";

const SYSTEM_PROMPT = `You are the editing assistant for a "generative dashboard" over a Gmail inbox.
You are given the current DashboardSpec JSON and one instruction from the user. Apply the change and
return JSON: {"spec": <full updated DashboardSpec>, "reply": "<one or two sentences: what you changed>"}.

Rules:
- Return the ENTIRE updated spec, not a diff.
- Keep every unchanged component's "id" EXACTLY the same so the grid layout stays stable.
  Give new components a fresh unique slug id.
- Update "layout" to match: keep entries for surviving ids, add {i,x,y,w,h} for new components
  (KPIs w:3 h:3, tables w:12 h:9, funnel/barlist/column w:6 h:7, timeline w:6 h:9), drop removed ids.
- Components may ONLY reference fields declared in entity.schema (or "_lastMessageDate"). If the
  user asks for something needing a new field, add it to entity.schema with a good extraction
  \`description\` (it will be populated on the next refresh).
- You may change title, description, sourceQuery, maxMessages, components, rowFlags, filters, layout.
- Treat filters as part of the dashboard experience: keep 1–4 useful low-cardinality fields users can
  explore themselves (for example stage, status, method, or transaction type).
- If the instruction is unclear or impossible, return the spec UNCHANGED and explain why in "reply".
- Strictly valid JSON, no markdown, no prose outside the JSON object.`;

function stripFences(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return (m ? m[1]! : t).trim();
}

export interface EditResult {
  spec: DashboardSpec;
  reply: string;
  changed: boolean;
}

async function call(
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

function parsePayload(text: string): { spec?: unknown; reply?: unknown } {
  try {
    return JSON.parse(stripFences(text));
  } catch {
    throw new Error("The assistant did not return valid JSON.");
  }
}

export async function editSpec(
  current: DashboardSpec,
  instruction: string
): Promise<EditResult> {
  const base = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `CURRENT SPEC:\n${JSON.stringify(current)}\n\nINSTRUCTION:\n${instruction.trim()}`,
    },
  ];

  const first = await call(base);
  const payload = parsePayload(first);
  const reply =
    typeof payload.reply === "string" && payload.reply.trim()
      ? payload.reply.trim()
      : "Updated the dashboard.";

  let next: DashboardSpec;
  try {
    next = finalizeSpec(parseSpec(payload.spec));
  } catch (err) {
    // One repair round-trip with the validation error.
    const detail = err instanceof Error ? err.message : String(err);
    const repaired = await call([
      ...base,
      { role: "assistant", content: first },
      {
        role: "user",
        content: `That spec failed validation. Return {"spec":<full corrected DashboardSpec>,"reply":<what changed>} — strict JSON. Filter ops must be one of eq|ne|gt|gte|lt|lte|contains|in|exists|older_than_days|newer_than_days. Problem:\n${detail}`,
      },
    ]).catch(() => "");
    try {
      next = finalizeSpec(parseSpec(parsePayload(repaired).spec));
    } catch (err2) {
      const d2 = err2 instanceof Error ? err2.message : String(err2);
      throw new Error(`The assistant produced an invalid spec: ${d2}`);
    }
  }

  const changed = JSON.stringify(next) !== JSON.stringify(current);
  return { spec: next, reply, changed };
}
