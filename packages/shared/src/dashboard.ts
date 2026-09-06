/**
 * Generative dashboards for a Gmail inbox.
 *
 * The user describes a dashboard in plain language ("track my job search",
 * "my UPI transactions this month"). An LLM turns that into a `DashboardSpec`
 * once. Everything downstream is deterministic: a Gmail search selects candidate
 * messages, a structured-extraction pass turns each into at most one row, rows
 * are merged by entity key, and the frontend renders the `components` from the
 * resulting rows on a draggable 12-column grid. Every rendered value traces back
 * to a real message id.
 */

export type DashboardFieldType =
  | "string"
  | "number"
  | "currency"
  | "date"
  | "enum"
  | "boolean";

export interface DashboardField {
  /** Machine name, snake_case. Referenced by components and filters. */
  name: string;
  type: DashboardFieldType;
  /** Allowed values when `type === "enum"`. Lowercase, stable. */
  enumValues?: string[];
  /** Extraction guidance shown to the model, e.g. "The hiring company's name". */
  description: string;
}

export interface DashboardEntity {
  /** Singular noun for one row, e.g. "application", "transaction". */
  name: string;
  /**
   * Fields whose combined value identifies one real-world entity. Rows that
   * agree on every key field (case-insensitively) are merged into one.
   */
  keyFields: string[];
  schema: DashboardField[];
}

export type FilterOp =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "in"
  | "exists"
  | "older_than_days"
  | "newer_than_days";

export interface Filter {
  field: string;
  op: FilterOp;
  /** Omitted for `exists`; array for `in`; number of days for the *_days ops. */
  value?: unknown;
}

export type AggKind = "count" | "sum" | "avg" | "min" | "max";

export type ColumnFormat =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "relative-date"
  | "badge";

export interface TableColumn {
  field: string;
  label: string;
  format?: ColumnFormat;
}

interface ComponentBase {
  /** Stable slug, unique within the spec. Grid layout items reference it. */
  id: string;
}

export type DashboardComponent =
  | (ComponentBase & {
      type: "kpi";
      label: string;
      agg: AggKind;
      /** Required for every agg except `count`. */
      field?: string;
      where?: Filter[];
      /** Optional unit suffix / prefix hint for display ("$", "days"). */
      unit?: string;
    })
  | (ComponentBase & {
      type: "table";
      title?: string;
      columns: TableColumn[];
      sortBy?: string;
      sortDir?: "asc" | "desc";
      where?: Filter[];
    })
  | (ComponentBase & {
      type: "funnel";
      title?: string;
      /** Enum field whose values are pipeline stages. */
      field: string;
      /** Stage order, first = top of funnel. */
      stages: string[];
    })
  | (ComponentBase & {
      type: "timeline";
      title?: string;
      dateField: string;
      labelField: string;
    })
  | (ComponentBase & {
      type: "barlist";
      title?: string;
      groupBy: string;
      agg: "count" | "sum";
      field?: string;
      limit?: number;
    })
  | (ComponentBase & {
      /** A compact vertical comparison chart, best for 3–8 categories. */
      type: "column";
      title?: string;
      groupBy: string;
      agg: "count" | "sum";
      field?: string;
      limit?: number;
    });

export type DashboardComponentType = DashboardComponent["type"];

export type FlagTone = "ok" | "warn" | "danger";

export interface RowFlag {
  name: string;
  where: Filter[];
  tone: FlagTone;
}

/** A user-facing filter the dashboard agent chose as useful for exploration. */
export interface DashboardFilterDefinition {
  /** Field from entity.schema that this filter controls. */
  field: string;
  /** Optional friendly label, e.g. "Application stage". */
  label?: string;
}

/** One tile's placement on the 12-column grid. `i` is a component id. */
export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardSpec {
  version: 1;
  title: string;
  description?: string;
  /** Gmail search syntax; selects the candidate message set each refresh. */
  sourceQuery: string;
  /** Hard cap on messages pulled per refresh. 1–200. */
  maxMessages: number;
  entity: DashboardEntity;
  components: DashboardComponent[];
  rowFlags?: RowFlag[];
  /** AI-selected, high-value filters shown above the dashboard. */
  filters?: DashboardFilterDefinition[];
  /** Grid placement, one entry per component id. Synthesised if absent. */
  layout?: GridItem[];
}

/** One message a row was derived from. */
export interface RowSource {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
}

/** A resolved dashboard row: extracted fields plus provenance. */
export interface DashboardRow {
  /** Normalized entity key (lowercased key-field values, joined by "␟"). */
  key: string;
  fields: Record<string, unknown>;
  sources: RowSource[];
  /** ISO date of the most recent contributing message. */
  lastMessageDate: string;
}

export type RefreshStatus = "idle" | "running" | "done" | "error";

/** Progress of the (background) extraction pipeline for one dashboard. */
export interface RefreshState {
  status: RefreshStatus;
  /** Machine phase: search | read | extract | resolve | idle. */
  phase?: string;
  /** Human sentence for the UI. */
  message?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface DashboardSummary {
  id: string;
  title: string;
  description?: string;
  rowCount: number;
  createdAt: string;
  updatedAt: string;
  lastRefreshedAt: string | null;
  refreshState: RefreshState;
}

/** Full payload for one dashboard's detail view. */
export interface DashboardView {
  id: string;
  spec: DashboardSpec;
  rows: DashboardRow[];
  createdAt: string;
  updatedAt: string;
  lastRefreshedAt: string | null;
  refreshState: RefreshState;
}

/** Reply from the layout/edit assistant. */
export interface DashboardAssistantReply {
  /** One or two sentences describing what changed (or why nothing did). */
  reply: string;
  changed: boolean;
  dashboard: DashboardView;
}
