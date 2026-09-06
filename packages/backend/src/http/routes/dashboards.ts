import { Hono } from "hono";
import { z } from "zod";
import { reconcileLayout } from "@email-os/shared";
import { getGmailClient } from "../../auth/gmail-client.js";
import { getThread } from "../../gmail/threads.js";
import {
  createDashboard,
  deleteDashboard,
  getDashboardView,
  getOwnedDashboard,
  listDashboards,
  updateLayout,
  updateSpec,
} from "../../db/dashboards.js";
import { generateSpec, finalizeSpec } from "../../dashboards/spec-generator.js";
import { gridItemSchema, parseSpec } from "../../dashboards/spec-schema.js";
import { editSpec } from "../../dashboards/assistant.js";
import { isRefreshing, reconcileStale, startRefresh } from "../../dashboards/refresh-runner.js";
import { requireAuth, type AuthVars } from "../middleware/require-auth.js";
import type { DashboardView } from "@email-os/shared";

export const dashboardRoutes = new Hono<{ Variables: AuthVars }>();

dashboardRoutes.use("/api/dashboards", requireAuth);
dashboardRoutes.use("/api/dashboards/*", requireAuth);

/** Applies the "running but no in-process job = stale" fix before responding. */
function withLiveState(view: DashboardView): DashboardView {
  return { ...view, refreshState: reconcileStale(view.id, view.refreshState) };
}

dashboardRoutes.get("/api/dashboards", async (c) => {
  const list = await listDashboards(c.get("user").id);
  return c.json({
    dashboards: list.map((d) => ({
      ...d,
      refreshState: isRefreshing(d.id)
        ? d.refreshState
        : reconcileStale(d.id, d.refreshState),
    })),
  });
});

dashboardRoutes.post("/api/dashboards", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ prompt?: string }>().catch(() => ({}) as { prompt?: string });
  const prompt = body.prompt?.trim();
  if (!prompt) return c.json({ error: "prompt is required" }, 400);
  if (prompt.length > 600) return c.json({ error: "prompt is too long" }, 400);

  let spec;
  try {
    spec = await generateSpec(prompt);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 422);
  }

  const dashboard = await createDashboard(user.id, spec);
  startRefresh(user.id, dashboard.id); // fills it in the background
  return c.json({ dashboard: await getDashboardView(user.id, dashboard.id) }, 201);
});

dashboardRoutes.get("/api/dashboards/:id", async (c) => {
  const view = await getDashboardView(c.get("user").id, c.req.param("id"));
  if (!view) return c.json({ error: "Not found" }, 404);
  return c.json({ dashboard: withLiveState(view) });
});

/** Fetches the complete Gmail thread behind a dashboard data point on demand. */
dashboardRoutes.get("/api/dashboards/:id/sources/:threadId", async (c) => {
  const user = c.get("user");
  const dashboard = await getOwnedDashboard(user.id, c.req.param("id"));
  if (!dashboard) return c.json({ error: "Dashboard not found" }, 404);

  try {
    const gmail = await getGmailClient(user.id);
    return c.json({ thread: await getThread(gmail, c.req.param("threadId")) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load this email thread." }, 502);
  }
});

dashboardRoutes.post("/api/dashboards/:id/refresh", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const view = await getDashboardView(user.id, id);
  if (!view) return c.json({ error: "Not found" }, 404);

  startRefresh(user.id, id);
  return c.json({ dashboard: await getDashboardView(user.id, id) }, 202);
});

dashboardRoutes.put("/api/dashboards/:id/spec", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ spec?: unknown }>().catch(() => ({}) as { spec?: unknown });

  let spec;
  try {
    spec = finalizeSpec(parseSpec(body.spec));
  } catch (err) {
    return c.json({ error: `Invalid spec: ${err instanceof Error ? err.message : err}` }, 400);
  }

  const ok = await updateSpec(user.id, id, spec);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ dashboard: await getDashboardView(user.id, id) });
});

dashboardRoutes.put("/api/dashboards/:id/layout", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ layout?: unknown }>().catch(() => ({}) as { layout?: unknown });

  const parsed = z.array(gridItemSchema).max(64).safeParse(body.layout);
  if (!parsed.success) return c.json({ error: "Invalid layout" }, 400);

  const ok = await updateLayout(user.id, id, parsed.data);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ dashboard: await getDashboardView(user.id, id) });
});

dashboardRoutes.post("/api/dashboards/:id/assistant", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ message?: string }>().catch(() => ({}) as { message?: string });
  const message = body.message?.trim();
  if (!message) return c.json({ error: "message is required" }, 400);
  if (message.length > 800) return c.json({ error: "message is too long" }, 400);

  const dash = await getOwnedDashboard(user.id, id);
  if (!dash) return c.json({ error: "Not found" }, 404);

  let result;
  try {
    result = await editSpec(dash.spec, message);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 422);
  }

  if (result.changed) {
    // Preserve any hand-tweaked positions the model didn't touch.
    result.spec.layout = reconcileLayout(result.spec, dash.spec.layout);
    await updateSpec(user.id, id, result.spec);
  }

  return c.json({
    reply: result.reply,
    changed: result.changed,
    dashboard: await getDashboardView(user.id, id),
  });
});

dashboardRoutes.delete("/api/dashboards/:id", async (c) => {
  const removed = await deleteDashboard(c.get("user").id, c.req.param("id"));
  if (!removed) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
