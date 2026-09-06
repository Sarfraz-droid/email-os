import { z } from "zod";
import type { DashboardComponent, DashboardSpec } from "@email-os/shared";

/** Runtime validation for an LLM-authored or user-edited DashboardSpec. */

const filter = z.object({
  field: z.string().min(1),
  op: z.enum([
    "eq",
    "ne",
    "gt",
    "gte",
    "lt",
    "lte",
    "contains",
    "in",
    "exists",
    "older_than_days",
    "newer_than_days",
  ]),
  value: z.unknown().optional(),
});

const field = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "field names must be snake_case"),
  type: z.enum(["string", "number", "currency", "date", "enum", "boolean"]),
  enumValues: z.array(z.string()).optional(),
  description: z.string().default(""),
});

const tableColumn = z.object({
  field: z.string().min(1),
  label: z.string().min(1),
  format: z
    .enum(["text", "number", "currency", "date", "relative-date", "badge"])
    .optional(),
});

const id = z.string().min(1).max(48);

const component = z.discriminatedUnion("type", [
  z.object({
    id,
    type: z.literal("kpi"),
    label: z.string().min(1),
    agg: z.enum(["count", "sum", "avg", "min", "max"]),
    field: z.string().optional(),
    where: z.array(filter).optional(),
    unit: z.string().optional(),
  }),
  z.object({
    id,
    type: z.literal("table"),
    title: z.string().optional(),
    columns: z.array(tableColumn).min(1),
    sortBy: z.string().optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
    where: z.array(filter).optional(),
  }),
  z.object({
    id,
    type: z.literal("funnel"),
    title: z.string().optional(),
    field: z.string().min(1),
    stages: z.array(z.string()).min(2),
  }),
  z.object({
    id,
    type: z.literal("timeline"),
    title: z.string().optional(),
    dateField: z.string().min(1),
    labelField: z.string().min(1),
  }),
  z.object({
    id,
    type: z.literal("barlist"),
    title: z.string().optional(),
    groupBy: z.string().min(1),
    agg: z.enum(["count", "sum"]),
    field: z.string().optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  z.object({
    id,
    type: z.literal("column"),
    title: z.string().optional(),
    groupBy: z.string().min(1),
    agg: z.enum(["count", "sum"]),
    field: z.string().optional(),
    limit: z.number().int().min(1).max(12).optional(),
  }),
]);

export const gridItemSchema = z.object({
  i: z.string().min(1),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(40),
});

export const dashboardSpecSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  sourceQuery: z.string().min(1),
  maxMessages: z.number().int().min(1).max(200).default(60),
  entity: z.object({
    name: z.string().min(1),
    keyFields: z.array(z.string().min(1)).min(1),
    schema: z.array(field).min(1).max(24),
  }),
  components: z.array(component).min(1).max(16),
  rowFlags: z
    .array(
      z.object({
        name: z.string().min(1),
        where: z.array(filter).min(1),
        tone: z.enum(["ok", "warn", "danger"]),
      })
    )
    .optional(),
  filters: z
    .array(
      z.object({
        field: z.string().min(1),
        label: z.string().min(1).max(48).optional(),
      })
    )
    .max(6)
    .optional(),
  layout: z.array(gridItemSchema).optional(),
});

const FIELD_TYPE_ALIASES: Record<string, string> = {
  text: "string",
  str: "string",
  varchar: "string",
  email: "string",
  url: "string",
  money: "currency",
  amount: "currency",
  price: "currency",
  int: "number",
  integer: "number",
  float: "number",
  double: "number",
  decimal: "number",
  percent: "number",
  datetime: "date",
  timestamp: "date",
  time: "date",
  day: "date",
  bool: "boolean",
  checkbox: "boolean",
  category: "enum",
  select: "enum",
};

const FILTER_OP_ALIASES: Record<string, string> = {
  "=": "eq",
  "==": "eq",
  "===": "eq",
  is: "eq",
  equals: "eq",
  "!=": "ne",
  "!==": "ne",
  "<>": "ne",
  not: "ne",
  ">": "gt",
  ">=": "gte",
  "=>": "gte",
  "<": "lt",
  "<=": "lte",
  "=<": "lte",
  like: "contains",
  "~": "contains",
  includes: "contains",
  "in?": "in",
  oneof: "in",
  present: "exists",
  "not null": "exists",
  older_than: "older_than_days",
  newer_than: "newer_than_days",
};

function normalizeFilters(where: unknown): unknown {
  if (!Array.isArray(where)) return where;
  return where.map((f) => {
    if (!f || typeof f !== "object") return f;
    const op = String((f as { op?: unknown }).op ?? "").toLowerCase().trim();
    return { ...(f as object), op: FILTER_OP_ALIASES[op] ?? op };
  });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Best-effort repair of the small shape mistakes LLMs reliably make, applied
 * before strict validation:
 *  - `entity.schema` handed back as an object map instead of an array
 *  - non-canonical field `type` names ("text", "datetime", "int", …)
 *  - missing / duplicate component `id`s
 */
function normalizeShape(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const spec = structuredClone(input) as Record<string, any>;

  const entity = spec.entity;
  if (entity && typeof entity === "object") {
    let schema = entity.schema;
    if (schema && !Array.isArray(schema) && typeof schema === "object") {
      schema = Object.entries(schema).map(([name, def]) =>
        def && typeof def === "object"
          ? { name, ...(def as object) }
          : { name, type: "string", description: "" }
      );
    }
    if (Array.isArray(schema)) {
      entity.schema = schema.map((f: any) => {
        if (!f || typeof f !== "object") return f;
        const type = String(f.type ?? "string").toLowerCase();
        return { ...f, type: FIELD_TYPE_ALIASES[type] ?? type };
      });
    }
  }

  if (Array.isArray(spec.components)) {
    const used = new Set<string>();
    spec.components = spec.components.map((c: any, idx: number) => {
      if (!c || typeof c !== "object") return c;
      let cid: string =
        typeof c.id === "string" && c.id.trim()
          ? slugify(c.id)
          : slugify(`${c.type ?? "tile"}-${c.label ?? c.title ?? idx}`);
      if (!cid) cid = `tile-${idx}`;
      while (used.has(cid)) cid = `${cid}-${idx}`;
      used.add(cid);
      const next = { ...c, id: cid };
      if ("where" in next) next.where = normalizeFilters(next.where);
      return next;
    });
  }

  if (Array.isArray(spec.rowFlags)) {
    spec.rowFlags = spec.rowFlags.map((f: any) =>
      f && typeof f === "object" ? { ...f, where: normalizeFilters(f.where) } : f
    );
  }
  return spec;
}

export function parseSpec(input: unknown): DashboardSpec {
  return dashboardSpecSchema.parse(normalizeShape(input)) as DashboardSpec;
}

// ── Field-reference validation ("is this dashboard actually relevant?") ────

/** Implicit fields every row exposes in addition to the entity schema. */
const IMPLICIT_FIELDS = new Set(["_lastMessageDate", "last_message_date", "_sourceCount"]);

function componentFieldRefs(c: DashboardComponent): string[] {
  const refs: string[] = [];
  const push = (v: string | undefined) => v && refs.push(v);
  if ("where" in c && c.where) for (const f of c.where) push(f.field);
  switch (c.type) {
    case "kpi":
      push(c.field);
      break;
    case "table":
      push(c.sortBy);
      for (const col of c.columns) push(col.field);
      break;
    case "funnel":
      push(c.field);
      break;
    case "timeline":
      push(c.dateField);
      push(c.labelField);
      break;
    case "barlist":
    case "column":
      push(c.groupBy);
      push(c.field);
      break;
  }
  return refs;
}

export interface ReferenceIssue {
  component: string;
  badFields: string[];
}

/** Every component field reference that does not exist in the entity schema. */
export function validateSpecReferences(spec: DashboardSpec): ReferenceIssue[] {
  const known = new Set(spec.entity.schema.map((f) => f.name));
  const issues: ReferenceIssue[] = [];
  for (const c of spec.components) {
    const bad = componentFieldRefs(c).filter(
      (name) => !known.has(name) && !IMPLICIT_FIELDS.has(name)
    );
    if (bad.length) issues.push({ component: c.id, badFields: [...new Set(bad)] });
  }
  for (const flag of spec.rowFlags ?? []) {
    const bad = flag.where
      .map((f) => f.field)
      .filter((name) => !known.has(name) && !IMPLICIT_FIELDS.has(name));
    if (bad.length) issues.push({ component: `rowFlag:${flag.name}`, badFields: bad });
  }
  for (const filter of spec.filters ?? []) {
    if (!known.has(filter.field)) {
      issues.push({ component: `filter:${filter.label ?? filter.field}`, badFields: [filter.field] });
    }
  }
  return issues;
}

/**
 * Last-resort guarantee that a dashboard renders: drop any component that
 * references a field the schema doesn't define, and prune rowFlags likewise.
 * Returns the number of components removed.
 */
export function pruneInvalidComponents(spec: DashboardSpec): number {
  const known = new Set(spec.entity.schema.map((f) => f.name));
  const ok = (name: string) => known.has(name) || IMPLICIT_FIELDS.has(name);

  const before = spec.components.length;
  spec.components = spec.components.filter((c) => componentFieldRefs(c).every(ok));
  if (spec.components.length === 0 && before > 0) {
    // Never leave an empty dashboard — keep a simple count KPI.
    spec.components = [
      { id: "count", type: "kpi", label: `Total ${spec.entity.name}`, agg: "count" },
    ];
  }
  if (spec.rowFlags) {
    spec.rowFlags = spec.rowFlags.filter((f) => f.where.every((w) => ok(w.field)));
  }
  const keptIds = new Set(spec.components.map((c) => c.id));
  if (spec.layout) spec.layout = spec.layout.filter((g) => keptIds.has(g.i));
  return before - spec.components.length;
}
