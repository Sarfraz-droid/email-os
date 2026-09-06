import { SlidersHorizontal, X } from "lucide-react";
import type { DashboardRow, DashboardSpec } from "@email-os/shared";
import { fieldValue } from "@email-os/shared";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DashboardFilters = Record<string, string>;
const ALL_VALUES = "__dashboard_all_values__";

function fieldLabel(field: string) {
  return field.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function filterDashboardRows(rows: DashboardRow[], filters: DashboardFilters) {
  return rows.filter((row) =>
    Object.entries(filters).every(([field, value]) => !value || String(fieldValue(row, field)) === value)
  );
}

export function DashboardFiltersBar({
  spec,
  rows,
  filters,
  onChange,
}: {
  spec: DashboardSpec;
  rows: DashboardRow[];
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
}) {
  const generated = new Map((spec.filters ?? []).map((filter) => [filter.field, filter]));
  const facets = spec.entity.schema
    .filter((field) => field.type === "enum" || field.type === "boolean" || field.type === "string")
    .map((field) => {
      const values = [...new Set(rows.map((row) => String(fieldValue(row, field.name) ?? "")).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
      return { field, values, generated: generated.get(field.name) };
    })
    // A select is helpful for a small, meaningful set—not a long directory of company names.
    .filter(({ field, values }) => field.type === "enum" || field.type === "boolean" || values.length <= 40)
    .filter(({ values }) => values.length > 1)
    .filter(({ generated: definition }) => generated.size === 0 || Boolean(definition));

  const activeCount = Object.values(filters).filter(Boolean).length;
  if (facets.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/65 p-3 shadow-sm-x">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <SlidersHorizontal className="size-3.5 text-primary" />
        Filter data
      </span>
      {facets.map(({ field, values, generated: definition }) => (
        <Select
          key={field.name}
          value={filters[field.name] || ALL_VALUES}
          onValueChange={(value) =>
            onChange({ ...filters, [field.name]: value === ALL_VALUES || value == null ? "" : value })
          }
        >
          <SelectTrigger size="sm" aria-label={definition?.label ?? fieldLabel(field.name)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_VALUES}>All {definition?.label ?? fieldLabel(field.name)}</SelectItem>
            {values.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ))}
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onChange({})}
          className="ml-auto text-muted-foreground"
        >
          <X data-icon="inline-start" />
          Clear filters
        </Button>
      )}
      <span className="basis-full px-0.5 pt-0.5 text-[0.7rem] text-muted-foreground/75">
        Click a metric, chart value, or table row to inspect the emails behind it.
      </span>
    </div>
  );
}
