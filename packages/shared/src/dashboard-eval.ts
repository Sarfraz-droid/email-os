/**
 * Deterministic evaluation of dashboard specs against resolved rows.
 *
 * Shared by the backend (nothing today, but available for validation) and the
 * frontend renderers so filter/aggregation semantics are defined exactly once.
 * No string-expression interpreter: components are fully structured, so this is
 * just typed predicate and reducer logic.
 */

import type {
  AggKind,
  DashboardComponent,
  DashboardRow,
  DashboardSpec,
  Filter,
  GridItem,
  RowFlag,
} from "./dashboard.js";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // Tolerate "$1,234.50", "1 234", "12%".
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toTime(value: unknown): number | null {
  if (value == null) return null;
  const t = new Date(value as string).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Whole days between `value` and now. Positive = in the past. */
export function daysSince(value: unknown): number | null {
  const t = toTime(value);
  if (t == null) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function matchesFilter(row: DashboardRow, filter: Filter): boolean {
  const raw = fieldValue(row, filter.field);
  const { op, value } = filter;

  switch (op) {
    case "exists":
      return raw != null && raw !== "";
    case "eq":
      return norm(raw) === norm(value);
    case "ne":
      return norm(raw) !== norm(value);
    case "contains":
      return String(raw ?? "").toLowerCase().includes(String(value ?? "").toLowerCase());
    case "in":
      return Array.isArray(value) && value.some((v) => norm(v) === norm(raw));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = toNumber(raw) ?? toTime(raw);
      const b = toNumber(value) ?? toTime(value);
      if (a == null || b == null) return false;
      if (op === "gt") return a > b;
      if (op === "gte") return a >= b;
      if (op === "lt") return a < b;
      return a <= b;
    }
    case "older_than_days": {
      const d = daysSince(raw);
      return d != null && typeof value === "number" && d > value;
    }
    case "newer_than_days": {
      const d = daysSince(raw);
      return d != null && typeof value === "number" && d <= value;
    }
    default:
      return false;
  }
}

export function matchesAll(row: DashboardRow, filters: Filter[] | undefined): boolean {
  if (!filters || filters.length === 0) return true;
  return filters.every((f) => matchesFilter(row, f));
}

/** Reads a field, allowing the implicit `_lastMessageDate` / `_sources` keys. */
export function fieldValue(row: DashboardRow, field: string): unknown {
  if (field === "_lastMessageDate" || field === "last_message_date") {
    return row.lastMessageDate;
  }
  if (field === "_sourceCount") return row.sources.length;
  return row.fields[field];
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function aggregate(
  rows: DashboardRow[],
  agg: AggKind,
  field: string | undefined,
  where: Filter[] | undefined
): number {
  const scoped = rows.filter((r) => matchesAll(r, where));
  if (agg === "count") return scoped.length;

  const nums = scoped
    .map((r) => (field ? toNumber(fieldValue(r, field)) : null))
    .filter((n): n is number => n != null);

  if (nums.length === 0) return 0;
  switch (agg) {
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "avg":
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min":
      return Math.min(...nums);
    case "max":
      return Math.max(...nums);
    default:
      return 0;
  }
}

export interface BarDatum {
  label: string;
  value: number;
}

export function barListData(
  rows: DashboardRow[],
  groupBy: string,
  agg: "count" | "sum",
  field: string | undefined,
  limit = 8
): BarDatum[] {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const key = String(fieldValue(row, groupBy) ?? "—");
    const add = agg === "count" ? 1 : toNumber(field ? fieldValue(row, field) : null) ?? 0;
    buckets.set(key, (buckets.get(key) ?? 0) + add);
  }
  return [...buckets.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function funnelData(
  rows: DashboardRow[],
  field: string,
  stages: string[]
): BarDatum[] {
  return stages.map((stage) => ({
    label: stage,
    value: rows.filter((r) => norm(fieldValue(r, field)) === norm(stage)).length,
  }));
}

/** Names of the flags that fire for a row, in spec order. */
export function rowFlags(row: DashboardRow, flags: RowFlag[] | undefined): RowFlag[] {
  if (!flags) return [];
  return flags.filter((f) => matchesAll(row, f.where));
}

export function sortRows(
  rows: DashboardRow[],
  sortBy: string | undefined,
  sortDir: "asc" | "desc" = "asc"
): DashboardRow[] {
  if (!sortBy) return rows;
  const dir = sortDir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = fieldValue(a, sortBy);
    const bv = fieldValue(b, sortBy);
    const an = toNumber(av) ?? toTime(av);
    const bn = toNumber(bv) ?? toTime(bv);
    if (an != null && bn != null) return (an - bn) * dir;
    return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
  });
}

export function componentTitle(c: DashboardComponent): string {
  if ("title" in c && c.title) return c.title;
  if (c.type === "kpi") return c.label;
  return c.type[0]!.toUpperCase() + c.type.slice(1);
}

// ── Grid layout ───────────────────────────────────────────────────────────

export const GRID_COLS = 12;

/** Natural tile size per component type, in grid units. */
function tileSize(c: DashboardComponent): { w: number; h: number } {
  switch (c.type) {
    case "kpi":
      return { w: 3, h: 3 };
    case "table":
      return { w: 12, h: 8 };
    case "timeline":
      return { w: 6, h: 9 };
    case "funnel":
    case "barlist":
    case "column":
      return { w: 6, h: 7 };
    default:
      return { w: 6, h: 6 };
  }
}

/**
 * A sensible starting layout: KPIs flow across the top row, everything else
 * stacks below in declaration order, wrapping at 12 columns.
 */
export function defaultLayout(spec: DashboardSpec): GridItem[] {
  const items: GridItem[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;

  const place = (c: DashboardComponent) => {
    const { w, h } = tileSize(c);
    if (x + w > GRID_COLS) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    items.push({ i: c.id, x, y, w, h });
    x += w;
    rowH = Math.max(rowH, h);
  };

  for (const c of spec.components.filter((c) => c.type === "kpi")) place(c);
  // Break the row after the KPIs.
  if (items.length > 0) {
    x = 0;
    y += rowH;
    rowH = 0;
  }
  for (const c of spec.components.filter((c) => c.type !== "kpi")) place(c);

  return items;
}

/**
 * Keeps layout entries whose component still exists and appends freshly-placed
 * tiles for any component without one. Used after an assistant/spec edit.
 */
export function reconcileLayout(spec: DashboardSpec, existing: GridItem[] | undefined): GridItem[] {
  const ids = new Set(spec.components.map((c) => c.id));
  const kept = (existing ?? []).filter((g) => ids.has(g.i));
  const have = new Set(kept.map((g) => g.i));
  const missing = spec.components.filter((c) => !have.has(c.id));
  if (missing.length === 0) {
    // AI-generated coordinates are useful intent, but poor proportions make a
    // dashboard feel broken. Keep deliberate layouts only when every tile has
    // a sensible footprint for its content; otherwise return to the balanced
    // system layout. User drag-resizes remain within these generous bounds.
    const componentsById = new Map(spec.components.map((c) => [c.id, c]));
    const valid =
      kept.length === spec.components.length &&
      kept.every((g) => {
        const c = componentsById.get(g.i);
        if (!c || g.x + g.w > GRID_COLS) return false;
        const natural = tileSize(c);
        const maxW = c.type === "table" ? 12 : natural.w === 3 ? 4 : 8;
        const maxH = c.type === "table" ? 14 : natural.h + 2;
        return g.w >= Math.min(natural.w, 3) && g.w <= maxW && g.h >= 3 && g.h <= maxH;
      });
    return valid ? kept : defaultLayout(spec);
  }

  let y = kept.reduce((max, g) => Math.max(max, g.y + g.h), 0);
  let x = 0;
  let rowH = 0;
  for (const c of missing) {
    const { w, h } = tileSize(c);
    if (x + w > GRID_COLS) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    kept.push({ i: c.id, x, y, w, h });
    x += w;
    rowH = Math.max(rowH, h);
  }
  return kept;
}
