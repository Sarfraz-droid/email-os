import type { RefreshState } from "@email-os/shared";
import { setRefreshState } from "../db/dashboards.js";
import { executeRefresh } from "./pipeline.js";

/**
 * In-process registry of running refreshes. One dashboard refreshes at a time;
 * a second request while one is in flight is a no-op. State lives in the
 * `dashboards.refresh_state` column so the polling UI can read progress even
 * across a server restart (a stale "running" is recovered on the next request).
 */
const inflight = new Map<string, Promise<void>>();

export function isRefreshing(dashboardId: string): boolean {
  return inflight.has(dashboardId);
}

/**
 * Kicks off a background refresh and returns immediately. Progress and the
 * terminal outcome are written to `refresh_state`.
 */
export function startRefresh(userId: string, dashboardId: string): void {
  if (inflight.has(dashboardId)) return;

  const run = (async () => {
    const startedAt = new Date().toISOString();
    await setRefreshState(dashboardId, {
      status: "running",
      phase: "search",
      message: "Starting…",
      startedAt,
    });
    try {
      await executeRefresh({
        userId,
        dashboardId,
        onPhase: (phase, message) => {
          // Fire-and-forget; ordering doesn't matter, last write wins.
          void setRefreshState(dashboardId, {
            status: "running",
            phase,
            message,
            startedAt,
          });
        },
      });
      await setRefreshState(dashboardId, {
        status: "done",
        phase: "done",
        message: "Up to date.",
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      await setRefreshState(dashboardId, {
        status: "error",
        phase: "error",
        error: err instanceof Error ? err.message : String(err),
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    } finally {
      inflight.delete(dashboardId);
    }
  })();

  inflight.set(dashboardId, run);
}

/** Treat a "running" state with no in-process job (e.g. after a restart) as stale. */
export function reconcileStale(dashboardId: string, state: RefreshState): RefreshState {
  if (state.status === "running" && !inflight.has(dashboardId)) {
    return { ...state, status: "error", error: "Refresh was interrupted. Try again." };
  }
  return state;
}
