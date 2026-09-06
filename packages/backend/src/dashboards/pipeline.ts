import type { gmail_v1 } from "googleapis";
import type { DashboardRow, DashboardSpec, MessageDetail } from "@email-os/shared";
import { getGmailClient } from "../auth/gmail-client.js";
import { getMessage, listMessages } from "../gmail/messages.js";
import { getOwnedDashboard, loadRows, saveRefresh } from "../db/dashboards.js";
import { extractEntities } from "./extractor.js";
import { resolveRows } from "./resolver.js";

/** Parallel `messages.get` calls while reading new mail. */
const READ_CONCURRENCY = 5;

export type PhaseFn = (phase: string, message: string) => void;

async function collectMessageIds(
  gmail: gmail_v1.Gmail,
  query: string,
  limit: number
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < limit) {
    const page = await listMessages(gmail, query, {
      maxResults: Math.min(50, limit - ids.length),
      pageToken,
    });
    for (const m of page.messages) ids.push(m.id);
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return ids.slice(0, limit);
}

async function readMessages(gmail: gmail_v1.Gmail, ids: string[]): Promise<MessageDetail[]> {
  const out: MessageDetail[] = [];
  for (let i = 0; i < ids.length; i += READ_CONCURRENCY) {
    const chunk = ids.slice(i, i + READ_CONCURRENCY);
    const details = await Promise.all(
      chunk.map((id) => getMessage(gmail, id).catch(() => null))
    );
    for (const d of details) if (d) out.push(d);
  }
  return out;
}

export interface RefreshArgs {
  userId: string;
  dashboardId: string;
  onPhase?: PhaseFn;
}

/**
 * Runs the extraction pipeline for one dashboard, start to finish:
 * search → drop already-seen ids → read new mail → extract → resolve → persist.
 * Reports progress through `onPhase`. Returns the merged row set.
 *
 * This is intentionally a plain async function (not a generator / SSE stream):
 * the caller runs it in the background and the UI polls for state, so no
 * long-lived HTTP connection is held open while the LLM works.
 */
export async function executeRefresh({
  userId,
  dashboardId,
  onPhase = () => {},
}: RefreshArgs): Promise<DashboardRow[]> {
  const dash = await getOwnedDashboard(userId, dashboardId);
  if (!dash) throw new Error("Dashboard not found.");

  const spec: DashboardSpec = dash.spec;
  const seen = new Set<string>(dash.seen_message_ids ?? []);
  const gmail = await getGmailClient(userId);

  onPhase("search", `Searching Gmail — ${spec.sourceQuery}`);
  const allIds = await collectMessageIds(gmail, spec.sourceQuery, spec.maxMessages);
  const newIds = allIds.filter((mid) => !seen.has(mid));
  const existing = await loadRows(dashboardId);

  if (newIds.length === 0) {
    onPhase("idle", "No new messages since the last refresh.");
    await saveRefresh(dashboardId, existing, []);
    return existing;
  }

  onPhase("read", `Reading ${newIds.length} new message${newIds.length === 1 ? "" : "s"}…`);
  const details = await readMessages(gmail, newIds);

  onPhase("extract", `Extracting ${spec.entity.name} records from ${details.length} messages…`);
  const extracted = await extractEntities(spec, details, (done, total) => {
    onPhase("extract", `Extracting… ${done}/${total} messages`);
  });
  const hits = extracted.filter((e) => e.entity).length;

  onPhase("resolve", `Merging ${hits} record${hits === 1 ? "" : "s"} into the dashboard…`);
  const rows = resolveRows(spec, existing, extracted);
  await saveRefresh(dashboardId, rows, newIds);
  return rows;
}
