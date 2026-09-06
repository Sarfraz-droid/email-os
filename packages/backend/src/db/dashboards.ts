import type {
  DashboardRow,
  DashboardSpec,
  DashboardSummary,
  DashboardView,
  GridItem,
  RefreshState,
} from "@email-os/shared";
import { db } from "./client.js";

/** How many recent message ids to remember for delta refreshes. */
const SEEN_CAP = 800;

interface DashRow {
  id: string;
  title: string;
  spec: DashboardSpec;
  seen_message_ids: string[];
  refresh_state: RefreshState;
  created_at: Date;
  updated_at: Date;
  last_refreshed_at: Date | null;
}

function iso(d: Date | null): string | null {
  return d ? new Date(d).toISOString() : null;
}

function viewFrom(r: DashRow, rows: DashboardRow[]): DashboardView {
  return {
    id: r.id,
    spec: r.spec,
    rows,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    lastRefreshedAt: iso(r.last_refreshed_at),
    refreshState: r.refresh_state ?? { status: "idle" },
  };
}

export async function createDashboard(
  userId: string,
  spec: DashboardSpec
): Promise<DashboardView> {
  const rows = await db()<DashRow[]>`
    INSERT INTO dashboards (user_id, title, spec)
    VALUES (${userId}, ${spec.title}, ${db().json(spec as never)})
    RETURNING id, title, spec, seen_message_ids, refresh_state,
              created_at, updated_at, last_refreshed_at
  `;
  return viewFrom(rows[0]!, []);
}

export async function listDashboards(userId: string): Promise<DashboardSummary[]> {
  const rows = await db()<
    (DashRow & { row_count: string })[]
  >`
    SELECT d.id, d.title, d.spec, d.seen_message_ids, d.refresh_state,
           d.created_at, d.updated_at, d.last_refreshed_at,
           count(r.entity_key) AS row_count
    FROM dashboards d
    LEFT JOIN dashboard_rows r ON r.dashboard_id = d.id
    WHERE d.user_id = ${userId}
    GROUP BY d.id
    ORDER BY d.updated_at DESC
    LIMIT 100
  `;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.spec?.description,
    rowCount: Number(r.row_count),
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    lastRefreshedAt: iso(r.last_refreshed_at),
    refreshState: r.refresh_state ?? { status: "idle" },
  }));
}

/** The dashboard plus its rows, only if it belongs to the user. */
export async function getDashboardView(
  userId: string,
  id: string
): Promise<DashboardView | undefined> {
  const dash = await getOwnedDashboard(userId, id);
  if (!dash) return undefined;
  return viewFrom(dash, await loadRows(id));
}

export async function getOwnedDashboard(
  userId: string,
  id: string
): Promise<DashRow | undefined> {
  const rows = await db()<DashRow[]>`
    SELECT id, title, spec, seen_message_ids, refresh_state,
           created_at, updated_at, last_refreshed_at
    FROM dashboards WHERE id = ${id} AND user_id = ${userId}
  `;
  return rows[0];
}

export async function loadRows(dashboardId: string): Promise<DashboardRow[]> {
  const rows = await db()<{ data: DashboardRow }[]>`
    SELECT data FROM dashboard_rows WHERE dashboard_id = ${dashboardId}
  `;
  return rows.map((r) => r.data);
}

export async function updateSpec(
  userId: string,
  id: string,
  spec: DashboardSpec
): Promise<boolean> {
  const rows = await db()<{ id: string }[]>`
    UPDATE dashboards
    SET spec = ${db().json(spec as never)}, title = ${spec.title}, updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}

/** Cheap layout-only write — no spec revalidation, no refresh. */
export async function updateLayout(
  userId: string,
  id: string,
  layout: GridItem[]
): Promise<boolean> {
  const rows = await db()<{ id: string }[]>`
    UPDATE dashboards
    SET spec = jsonb_set(spec, '{layout}', ${db().json(layout as never)}), updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function setRefreshState(id: string, state: RefreshState): Promise<void> {
  await db()`
    UPDATE dashboards SET refresh_state = ${db().json(state as never)} WHERE id = ${id}
  `;
}

/**
 * Persists the merged row set and records which message ids have now been seen.
 * Rows are fully replaced (the resolver already folds in the previous set).
 */
export async function saveRefresh(
  dashboardId: string,
  rows: DashboardRow[],
  newlySeen: string[]
): Promise<void> {
  await db().begin(async (sql) => {
    await sql`DELETE FROM dashboard_rows WHERE dashboard_id = ${dashboardId}`;
    if (rows.length > 0) {
      const values = rows.map((r) => ({
        dashboard_id: dashboardId,
        entity_key: r.key,
        data: sql.json(r as never),
      }));
      await sql`
        INSERT INTO dashboard_rows ${sql(values, "dashboard_id", "entity_key", "data")}
      `;
    }
    const current = await sql<{ seen_message_ids: string[] }[]>`
      SELECT seen_message_ids FROM dashboards WHERE id = ${dashboardId}
    `;
    const merged = Array.from(
      new Set([...(current[0]?.seen_message_ids ?? []), ...newlySeen])
    ).slice(-SEEN_CAP);
    await sql`
      UPDATE dashboards
      SET seen_message_ids = ${sql.json(merged as never)},
          last_refreshed_at = now(),
          updated_at = now()
      WHERE id = ${dashboardId}
    `;
  });
}

export async function deleteDashboard(userId: string, id: string): Promise<boolean> {
  const rows = await db()<{ id: string }[]>`
    DELETE FROM dashboards WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `;
  return rows.length > 0;
}
