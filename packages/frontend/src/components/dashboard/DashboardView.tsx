import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  LayoutDashboard,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type {
  DashboardRow,
  DashboardSummary,
  DashboardView as DashboardViewData,
  GridItem,
  ThreadDetail,
} from "@email-os/shared";
import {
  createDashboard,
  deleteDashboard,
  getDashboard,
  getDashboardSourceThread,
  listDashboards,
  startDashboardRefresh,
  updateDashboardLayout,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GridBoard } from "./GridBoard";
import { AssistantPanel } from "./AssistantPanel";
import { DashboardFiltersBar, filterDashboardRows, type DashboardFilters } from "./DashboardFilters";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { MailModal } from "@/components/chat/MailModal";

const EXAMPLES = [
  "Track my job search — every company I've applied to and what stage it's at",
  "My UPI / bank transactions in the last 60 days, by merchant",
  "P0 threads: anything urgent that's waiting on me to reply",
  "Every subscription or SaaS renewal that emails me a receipt",
];

const POLL_MS = 2500;

export function DashboardView({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<DashboardSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<DashboardViewData | null>(null);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [evidence, setEvidence] = useState<{ title: string; rows: DashboardRow[] } | null>(null);
  const [mailThread, setMailThread] = useState<ThreadDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<string | null>(null);

  const loadList = useCallback(() => {
    listDashboards()
      .then(setList)
      .catch(() => {
        /* keep whatever we have */
      });
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      let misses = 0;
      pollRef.current = setInterval(async () => {
        if (activeRef.current !== id) return stopPolling();
        try {
          const fresh = await getDashboard(id);
          misses = 0;
          if (activeRef.current === id) setView(fresh);
          if (fresh.refreshState.status !== "running") {
            stopPolling();
            loadList();
          }
        } catch {
          // Transient — getDashboard already retried. Keep polling a while.
          if (++misses > 6) stopPolling();
        }
      }, POLL_MS);
    },
    [stopPolling, loadList]
  );

  useEffect(() => {
    loadList();
    return () => {
      stopPolling();
      if (layoutTimer.current) clearTimeout(layoutTimer.current);
    };
  }, [loadList, stopPolling]);

  const open = useCallback(
    async (id: string) => {
      activeRef.current = id;
      setActiveId(id);
      setView(null);
      setLoadError(null);
      setEditing(false);
      setAssistantOpen(false);
      setFilters({});
      setEvidence(null);
      setMailThread(null);
      try {
        const data = await getDashboard(id);
        if (activeRef.current !== id) return;
        setView(data);
        if (data.refreshState.status === "running") startPolling(id);
        else if (!data.lastRefreshedAt) {
          await startDashboardRefresh(id);
          startPolling(id);
        }
      } catch (err) {
        if (activeRef.current === id) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [startPolling]
  );

  const refresh = useCallback(
    async (id: string) => {
      setLoadError(null);
      try {
        const data = await startDashboardRefresh(id);
        setView(data);
        startPolling(id);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    },
    [startPolling]
  );

  const create = useCallback(async () => {
    const text = prompt.trim();
    if (!text || creating) return;
    setCreating(true);
    setLoadError(null);
    try {
      const data = await createDashboard(text);
      setPrompt("");
      loadList();
      activeRef.current = data.id;
      setActiveId(data.id);
      setView(data);
      startPolling(data.id);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }, [prompt, creating, loadList, startPolling]);

  const remove = useCallback(
    async (id: string) => {
      await deleteDashboard(id);
      setList((prev) => prev.filter((d) => d.id !== id));
      if (id === activeRef.current) {
        activeRef.current = null;
        setActiveId(null);
        setView(null);
        stopPolling();
      }
    },
    [stopPolling]
  );

  const back = () => {
    stopPolling();
    activeRef.current = null;
    setActiveId(null);
    setView(null);
    setLoadError(null);
    setFilters({});
    setEvidence(null);
    setMailThread(null);
    loadList();
  };

  const persistLayout = useCallback(
    (layout: GridItem[]) => {
      const id = activeRef.current;
      if (!id || !editing) return;
      setView((v) => (v ? { ...v, spec: { ...v.spec, layout } } : v));
      if (layoutTimer.current) clearTimeout(layoutTimer.current);
      layoutTimer.current = setTimeout(() => {
        updateDashboardLayout(id, layout).catch(() => {
          /* best-effort; will re-save on next drag */
        });
      }, 700);
    },
    [editing]
  );

  const openEvidence = useCallback((title: string, rows: DashboardRow[]) => {
    setAssistantOpen(false);
    setEvidence({ title, rows });
  }, []);

  const openThread = useCallback(async (threadId: string) => {
    const id = activeRef.current;
    if (!id || threadLoading) return;
    setThreadLoading(true);
    try {
      const thread = await getDashboardSourceThread(id, threadId);
      setMailThread(thread);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this email thread.");
    } finally {
      setThreadLoading(false);
    }
  }, [threadLoading]);

  // ── Detail view ────────────────────────────────────────────────────────
  if (activeId) {
    const state = view?.refreshState;
    const running = state?.status === "running";
    const errored = state?.status === "error";
    const filteredRows = view ? filterDashboardRows(view.rows, filters) : [];

    return (
      <div className="flex h-svh w-full flex-col overflow-hidden">
        <header className="surface-blur z-20 flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={back}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
            aria-label="Back to dashboards"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-sm font-semibold">
              {view?.spec.title ?? "Loading…"}
            </h1>
            {running ? (
              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                {state?.message ?? "Working…"}
              </p>
            ) : (
              view?.spec.description && (
                <p className="truncate text-xs text-muted-foreground">{view.spec.description}</p>
              )
            )}
          </div>

          <Button
            size="sm"
            variant={editing ? "default" : "outline"}
            onClick={() => setEditing((e) => !e)}
            disabled={!view}
          >
            <Pencil className="size-3.5" />
            {editing ? "Done" : "Edit layout"}
          </Button>
          <Button
            size="sm"
            variant={assistantOpen ? "default" : "outline"}
            onClick={() => setAssistantOpen((o) => !o)}
            disabled={!view}
          >
            <Sparkles className="size-3.5" />
            Assistant
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={running || !view}
            onClick={() => activeId && refresh(activeId)}
          >
            <RefreshCw className={`size-3.5 ${running ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => activeId && remove(activeId)}
            aria-label="Delete dashboard"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5">
            <div className="mx-auto max-w-6xl">
              {loadError && (
                <Alert variant="destructive" className="mb-4">
                  <TriangleAlert />
                  <AlertTitle>Couldn’t load this dashboard</AlertTitle>
                  <AlertDescription>{loadError}</AlertDescription>
                  <AlertAction>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => (activeId ? open(activeId) : undefined)}
                  >
                    Retry
                  </Button>
                  </AlertAction>
                </Alert>
              )}

              {errored && !loadError && (
                <Alert variant="destructive" className="mb-4">
                  <TriangleAlert />
                  <AlertTitle>Refresh didn’t finish</AlertTitle>
                  <AlertDescription>{state?.error ?? "Try refreshing the dashboard again."}</AlertDescription>
                  <AlertAction>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => activeId && refresh(activeId)}
                  >
                    Try again
                  </Button>
                  </AlertAction>
                </Alert>
              )}

              {editing && (
                <p className="mb-3 text-xs text-muted-foreground/70">
                  Drag tiles by their handle, resize from the bottom-right corner. Changes save automatically.
                </p>
              )}

              {!view ? (
                <div className="grid place-items-center py-24 text-muted-foreground">
                  <Loader2 className="size-6 animate-spin" />
                </div>
              ) : (
                <>
                  <DashboardFiltersBar
                    spec={view.spec}
                    rows={view.rows}
                    filters={filters}
                    onChange={setFilters}
                  />
                  <GridBoard
                    spec={view.spec}
                    rows={filteredRows}
                    editing={editing}
                    onLayoutChange={persistLayout}
                    onOpenEvidence={openEvidence}
                    onOpenThread={openThread}
                  />
                  <p className="pt-4 text-center text-xs text-muted-foreground/50">
                    {filteredRows.length} of {view.rows.length} {view.spec.entity.name}
                    {view.rows.length === 1 ? "" : "s"} · {view.spec.sourceQuery}
                    {view.lastRefreshedAt &&
                      ` · refreshed ${new Date(view.lastRefreshedAt).toLocaleString()}`}
                  </p>
                </>
              )}
            </div>
          </div>

          {assistantOpen && view && (
            <AssistantPanel
              dashboardId={view.id}
              onClose={() => setAssistantOpen(false)}
              onUpdated={(v) => setView(v)}
            />
          )}
          {evidence && (
            <EvidenceDrawer
              title={evidence.title}
              rows={evidence.rows}
              onClose={() => setEvidence(null)}
              onOpenThread={openThread}
            />
          )}
        </div>
        {threadLoading && (
          <div className="fixed inset-0 z-40 grid place-items-center bg-background/55 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-md-x">
              <Loader2 className="size-4 animate-spin text-primary" /> Loading email thread…
            </div>
          </div>
        )}
        {mailThread && (
          <MailModal
            title={mailThread.messages.at(-1)?.subject || "Email thread"}
            messages={mailThread.messages}
            onClose={() => setMailThread(null)}
          />
        )}
      </div>
    );
  }

  // ── List + create view ─────────────────────────────────────────────────
  return (
    <div className="flex h-svh w-full flex-col overflow-hidden">
      <header className="surface-blur z-20 flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Back to chat"
        >
          <ArrowLeft className="size-4" />
        </button>
        <LayoutDashboard className="size-4 text-primary" />
        <h1 className="font-heading text-sm font-semibold">Dashboards</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="font-heading text-base font-medium">Build a dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Describe what you want to see. An agent designs the layout, then reads your
              inbox in the background to fill it in — every number links back to a real email.
            </p>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") create();
              }}
              rows={3}
              placeholder="e.g. Track my job search — companies, roles, and interview stage"
              className="min-h-24 resize-none"
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="rounded-full border border-strong bg-card/70 px-3 py-1.5 text-left text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={create} disabled={creating || !prompt.trim()}>
                {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {creating ? "Designing…" : "Create dashboard"}
              </Button>
              <span className="text-xs text-muted-foreground/60">⌘↵ to submit</span>
            </div>
            {loadError && <p className="text-sm text-destructive">{loadError}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <p className="label-eq px-1 text-muted-foreground/60">Your dashboards</p>
            {list.length === 0 ? (
              <p className="px-1 py-4 text-sm text-muted-foreground/60">None yet. Create one above.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.map((d) => (
                  <li key={d.id} className="group/row relative">
                    <button
                      type="button"
                      onClick={() => open(d.id)}
                      className="flex w-full flex-col items-start gap-1 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:ring-primary/40"
                    >
                      <span className="font-heading text-sm font-medium">{d.title}</span>
                      {d.description && (
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {d.description}
                        </span>
                      )}
                      <span className="mt-1 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground/60">
                        {d.refreshState.status === "running" && (
                          <Loader2 className="size-3 animate-spin" />
                        )}
                        {d.refreshState.status === "error" && (
                          <TriangleAlert className="size-3 text-destructive" />
                        )}
                        {d.rowCount} row{d.rowCount === 1 ? "" : "s"}
                        {d.lastRefreshedAt
                          ? ` · ${new Date(d.lastRefreshedAt).toLocaleDateString()}`
                          : " · never refreshed"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(d.id)}
                      aria-label="Delete"
                      className="absolute top-3 right-3 grid size-6 place-items-center rounded text-muted-foreground/40 opacity-0 hover:text-destructive group-hover/row:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
