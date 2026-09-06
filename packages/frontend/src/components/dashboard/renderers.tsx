import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { useState } from "react";
import type {
  ColumnFormat,
  DashboardComponent,
  DashboardRow,
  DashboardSpec,
} from "@email-os/shared";
import {
  aggregate,
  barListData,
  componentTitle,
  daysSince,
  funnelData,
  matchesAll,
  fieldValue,
  rowFlags,
  sortRows,
} from "@email-os/shared";

const toneClass: Record<string, string> = {
  ok: "bg-emerald-400/5",
  warn: "bg-amber-400/6",
  danger: "bg-destructive/7",
};

const TABLE_PAGE_SIZE = 4;
const CHART_PAGE_SIZE = 6;

function fmtNumber(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
}

function fmtCurrency(v: unknown): string {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return String(v ?? "—");
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtRelative(v: unknown): string {
  const days = daysSince(v);
  if (days == null) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function fmtCell(value: unknown, format: ColumnFormat | undefined) {
  if (value == null || value === "") return <span className="text-muted-foreground/50">—</span>;
  switch (format) {
    case "currency":
      return fmtCurrency(value);
    case "number":
      return typeof value === "number" ? fmtNumber(value) : String(value);
    case "date":
      return fmtDate(value);
    case "relative-date":
      return fmtRelative(value);
    case "badge":
      return (
        <span className="inline-flex items-center rounded-full bg-primary/12 px-2 py-0.5 text-[0.7rem] font-medium text-primary capitalize ring-1 ring-primary/20">
          {String(value)}
        </span>
      );
    default:
      return String(value);
  }
}

function Panel({
  title,
  editing,
  children,
}: {
  title: string;
  editing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="dashboard-panel flex h-full flex-col overflow-hidden rounded-xl bg-card">
      <div className="flex shrink-0 items-center gap-1.5 px-4 pt-3 pb-2">
        {editing && (
          <GripVertical className="drag-handle size-4 shrink-0 cursor-grab text-muted-foreground/50 hover:text-foreground active:cursor-grabbing" />
        )}
        <h3 className="font-heading text-sm font-semibold tracking-[-0.01em] text-foreground/90">
          {title}
        </h3>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">{children}</div>
    </section>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const safePage = Math.min(page, pageCount - 1);
  const from = safePage * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);

  return (
    <nav className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3" aria-label="Pagination">
      <span className="text-xs text-muted-foreground">
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage === 0}
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-12 text-center text-xs font-medium tabular-nums text-muted-foreground">
          {safePage + 1} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= pageCount - 1}
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}

function Kpi({
  rows,
  c,
  editing,
  onOpenEvidence,
}: {
  rows: DashboardRow[];
  c: Extract<DashboardComponent, { type: "kpi" }>;
  editing?: boolean;
  onOpenEvidence: (title: string, rows: DashboardRow[]) => void;
}) {
  const value = aggregate(rows, c.agg, c.field, c.where);
  const display = c.agg === "avg" ? value.toFixed(1) : fmtNumber(value);
  return (
    <button
      type="button"
      onClick={() => onOpenEvidence(c.label, rows.filter((row) => matchesAll(row, c.where)))}
      className="dashboard-kpi group flex h-full w-full flex-col justify-between overflow-hidden rounded-xl bg-card p-5 text-left transition-colors hover:bg-muted/55"
      aria-label={`View source emails for ${c.label}`}
    >
      <span className="label-eq flex items-center gap-1.5 text-muted-foreground/80">
        {editing && (
          <GripVertical className="drag-handle size-3.5 cursor-grab text-muted-foreground/50 active:cursor-grabbing" />
        )}
        {c.label}
      </span>
      <span className="font-heading text-[clamp(1.65rem,2.3vw,2.25rem)] font-semibold tracking-[-0.035em] tabular-nums text-foreground">
        {c.unit && c.unit.length <= 2 ? c.unit : ""}
        {display}
        {c.unit && c.unit.length > 2 ? ` ${c.unit}` : ""}
      </span>
      <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        View source emails
      </span>
    </button>
  );
}

function Table({
  rows,
  spec,
  c,
  editing,
  onOpenEvidence,
  onOpenThread,
}: {
  rows: DashboardRow[];
  spec: DashboardSpec;
  c: Extract<DashboardComponent, { type: "table" }>;
  editing?: boolean;
  onOpenEvidence: (title: string, rows: DashboardRow[]) => void;
  onOpenThread: (threadId: string) => void;
}) {
  const [page, setPage] = useState(0);
  const scoped = sortRows(
    rows.filter((r) => matchesAll(r, c.where)),
    c.sortBy,
    c.sortDir
  );
  const pageCount = Math.max(1, Math.ceil(scoped.length / TABLE_PAGE_SIZE));
  const activePage = Math.min(page, pageCount - 1);
  const visibleRows = scoped.slice(
    activePage * TABLE_PAGE_SIZE,
    (activePage + 1) * TABLE_PAGE_SIZE
  );

  return (
    <Panel title={componentTitle(c)} editing={editing}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-[0.68rem] font-medium tracking-[0.08em] text-muted-foreground/75 uppercase">
              {c.columns.map((col) => (
                <th key={col.field} className="px-2 py-1.5 font-medium">
                  {col.label}
                </th>
              ))}
              <th className="px-2 py-1.5 font-medium">Src</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => {
              const flags = rowFlags(row, spec.rowFlags);
              const tone = flags[0] ? toneClass[flags[0].tone] : "";
              return (
                <tr
                  key={row.key || i}
                  className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/35 last:border-0 ${tone}`}
                  title={flags.map((f) => f.name).join(", ") || undefined}
                  onClick={() => onOpenEvidence(componentTitle(c), [row])}
                >
                  {c.columns.map((col) => (
                    <td key={col.field} className="max-w-72 px-2 py-2 align-top text-foreground/88">
                      <span className="line-clamp-2 leading-5">
                        {fmtCell(fieldValue(row, col.field), col.format)}
                      </span>
                    </td>
                  ))}
                  <td className="px-2 py-2 align-top">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        const first = row.sources[0];
                        if (first) onOpenThread(first.threadId);
                      }}
                      className="inline-flex min-w-6 items-center justify-center rounded px-1 py-0.5 text-[0.7rem] text-primary transition-colors hover:bg-primary/12 disabled:text-muted-foreground/50"
                      disabled={row.sources.length === 0}
                      title={row.sources.map((s) => `Open: ${s.subject} — ${s.from}`).join("\n")}
                      aria-label={`Open source email${row.sources.length === 1 ? "" : "s"}`}
                    >
                      {row.sources.length}
                    </button>
                  </td>
                </tr>
              );
            })}
            {scoped.length === 0 && (
              <tr>
                <td
                  colSpan={c.columns.length + 1}
                  className="px-2 py-6 text-center text-sm text-muted-foreground/60"
                >
                  No transactions yet. Refresh to check for new email receipts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={activePage}
        total={scoped.length}
        pageSize={TABLE_PAGE_SIZE}
        onPageChange={setPage}
      />
    </Panel>
  );
}

function Bars({
  data,
  title,
  editing,
  onSelect,
}: {
  data: { label: string; value: number }[];
  title: string;
  editing?: boolean;
  onSelect: (label: string) => void;
}) {
  const [page, setPage] = useState(0);
  const max = Math.max(1, ...data.map((d) => d.value));
  const pageCount = Math.max(1, Math.ceil(data.length / CHART_PAGE_SIZE));
  const activePage = Math.min(page, pageCount - 1);
  const visibleData = data.slice(activePage * CHART_PAGE_SIZE, (activePage + 1) * CHART_PAGE_SIZE);
  return (
    <Panel title={title} editing={editing}>
      <div className="flex flex-col gap-2.5">
        {visibleData.map((d) => (
          <button
            key={d.label}
            type="button"
            onClick={() => onSelect(d.label)}
            className="group flex w-full items-center gap-3 rounded-md px-1 text-left transition-colors hover:bg-muted/45"
            aria-label={`View source emails for ${d.label}`}
          >
            <span
              className="w-[min(15rem,30%)] shrink-0 break-words text-right text-xs leading-4 font-medium text-muted-foreground capitalize"
              title={d.label}
            >
              {d.label}
            </span>
            <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted/65">
              <div
                className="dashboard-bar h-full rounded-md"
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-foreground/80">
              {fmtNumber(d.value)}
            </span>
          </button>
        ))}
        {data.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground/60">No data.</p>
        )}
      </div>
      <Pagination
        page={activePage}
        total={data.length}
        pageSize={CHART_PAGE_SIZE}
        onPageChange={setPage}
      />
    </Panel>
  );
}

function Columns({
  data,
  title,
  editing,
  onSelect,
}: {
  data: { label: string; value: number }[];
  title: string;
  editing?: boolean;
  onSelect: (label: string) => void;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <Panel title={title} editing={editing}>
      {data.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground/60">No data.</p>
      ) : (
        <div className="flex h-full min-h-40 items-end gap-2.5 pt-2" aria-label={title}>
          {data.map((d, index) => (
            <button
              key={d.label}
              type="button"
              onClick={() => onSelect(d.label)}
              className="flex min-w-0 flex-1 flex-col justify-end gap-2 rounded-md text-left transition-colors hover:bg-muted/45"
              aria-label={`View source emails for ${d.label}`}
            >
              <span className="text-center text-xs font-medium tabular-nums text-foreground/85">
                {fmtNumber(d.value)}
              </span>
              <div className="flex h-28 items-end rounded-t-md bg-muted/45">
                <div
                  className={`dashboard-column dashboard-column-${index % 5} w-full rounded-t-md`}
                  style={{ height: `${Math.max(6, (d.value / max) * 100)}%` }}
                />
              </div>
              <span className="line-clamp-2 text-center text-[0.68rem] leading-4 text-muted-foreground capitalize">
                {d.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Timeline({
  rows,
  c,
  editing,
  onOpenEvidence,
}: {
  rows: DashboardRow[];
  c: Extract<DashboardComponent, { type: "timeline" }>;
  editing?: boolean;
  onOpenEvidence: (title: string, rows: DashboardRow[]) => void;
}) {
  const items = sortRows(rows, c.dateField, "desc").slice(0, 60);
  return (
    <Panel title={componentTitle(c)} editing={editing}>
      <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
        {items.map((row, i) => (
          <li key={row.key || i} className="relative">
            <span className="absolute top-1.5 -left-[1.30rem] size-2 rounded-full bg-primary/70 ring-2 ring-card" />
            <button
              type="button"
              onClick={() => onOpenEvidence(componentTitle(c), [row])}
              className="w-full rounded-md py-0.5 text-left transition-colors hover:bg-muted/45"
            >
              <div className="text-xs text-muted-foreground/70">
                {fmtDate(fieldValue(row, c.dateField))}
              </div>
              <div className="text-sm text-foreground/90 capitalize">
                {String(fieldValue(row, c.labelField) ?? "—")}
              </div>
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-muted-foreground/60">Nothing on the timeline yet.</li>
        )}
      </ol>
    </Panel>
  );
}

export function ComponentCard({
  component,
  rows,
  spec,
  editing,
  onOpenEvidence,
  onOpenThread,
}: {
  component: DashboardComponent;
  rows: DashboardRow[];
  spec: DashboardSpec;
  editing?: boolean;
  onOpenEvidence: (title: string, rows: DashboardRow[]) => void;
  onOpenThread: (threadId: string) => void;
}) {
  switch (component.type) {
    case "kpi":
      return <Kpi rows={rows} c={component} editing={editing} onOpenEvidence={onOpenEvidence} />;
    case "table":
      return <Table rows={rows} spec={spec} c={component} editing={editing} onOpenEvidence={onOpenEvidence} onOpenThread={onOpenThread} />;
    case "funnel":
      return (
        <Bars
          title={componentTitle(component)}
          editing={editing}
          data={funnelData(rows, component.field, component.stages)}
          onSelect={(label) => onOpenEvidence(`${componentTitle(component)}: ${label}`, rows.filter((row) => String(fieldValue(row, component.field) ?? "") === label))}
        />
      );
    case "barlist":
      return (
        <Bars
          title={componentTitle(component)}
          editing={editing}
          data={barListData(
            rows,
            component.groupBy,
            component.agg,
            component.field,
            component.limit
          )}
          onSelect={(label) => onOpenEvidence(`${componentTitle(component)}: ${label}`, rows.filter((row) => String(fieldValue(row, component.groupBy) ?? "") === label))}
        />
      );
    case "column":
      return (
        <Columns
          title={componentTitle(component)}
          editing={editing}
          data={barListData(
            rows,
            component.groupBy,
            component.agg,
            component.field,
            component.limit
          )}
          onSelect={(label) => onOpenEvidence(`${componentTitle(component)}: ${label}`, rows.filter((row) => String(fieldValue(row, component.groupBy) ?? "") === label))}
        />
      );
    case "timeline":
      return <Timeline rows={rows} c={component} editing={editing} onOpenEvidence={onOpenEvidence} />;
    default:
      return null;
  }
}
