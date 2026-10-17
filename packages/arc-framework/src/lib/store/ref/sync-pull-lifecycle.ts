/** Reconcile shared records before applying the item lifecycle moves those records describe. */

import type { FetchOutcome } from "../../git/fetch.js";
import type { HistoryRef } from "../refusal.js";
import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { fetchRefHistories } from "./fetch.js";
import { readSyncRefs } from "./sync-graph.js";
import { mergeRefSets, type RefMergeOptions, type RefMergeResult, type RefMergeRoute } from "./sync-merge.js";
import { readPendingRefEnds, readPendingRefReopens, resolvePendingRefEnds } from "./sync-lifecycle.js";

/** A failed supplemental fetch retains the shared merges already committed. */
export type LifecyclePullResult = RefMergeResult | { status: "fetch-failed"; fetched: Extract<FetchOutcome, { status: "unreachable" }> };

/** Keep by-name histories out of ordinary merging until end detection has read the pre-pull histories. */
export async function mergePulledRefState(context: RefBackendContext, incoming: Map<string, string>,
  designation: RefDesignation, remote: RefRemoteDesignation, requested: readonly HistoryRef[],
  options: RefMergeOptions): Promise<LifecyclePullResult> {
  const held = await readSyncRefs(context, "refs/arc/");
  const shared = new Map([...incoming].filter(([ref]) => !isItem(ref)));
  const first = await mergeRefSets(context, held, shared, options);
  if (first.status === "restart") return first;
  const state = await readSyncRefs(context, "refs/arc/");
  let pending = await readPendingRefEnds(context, held, state, incoming);
  const discovered = pending.filter(({ history }) => !requested.includes(history));
  if (discovered.length) {
    const fetched = await fetchRefHistories(context, remote, designation, discovered.map(({ history }) => history), context.syncDeadline?.signal);
    if (fetched.status === "unreachable") return { status: "fetch-failed", fetched };
    captureFetchedHistories(incoming, discovered.map(({ history }) => history), remote.name, fetched);
  }
  pending = await resolvePendingRefEnds(context, pending, held, incoming);
  const histories = new Set<string>([...requested, ...discovered.map(({ history }) => history)]);
  const items = new Map([...incoming].filter(([ref]) => isItem(ref)
    && !pending.some(({ live, history }) => ref === live || ref === history)
    && (!ref.startsWith("refs/arc/history/") || histories.has(ref))));
  const notices: PullNotice[] = [...first.notices];
  for (const { history, owner } of pending) {
    const tip = incoming.get(history);
    if (tip) items.set(history, tip);
    else notices.push({ kind: "end-pending", item: owner, ref: history,
      condition: "The end record is present but the state remote has no retained history for this item.",
      remedy: { text: `Have a clone holding ${history} push it back to the state remote, then pull again.` } });
  }
  const reopens = await readPendingRefReopens(context, held, state, incoming);
  const routes = lifecycleRoutes(held, items, reopens);
  for (const { live, history } of pending) if (held.has(live) && incoming.has(history)) {
    routes.set(history, { ref: history, source: live });
  }
  const last = await mergeRefSets(context, state, items, { ...options, routes, incomingState: incoming, priorState: held });
  if (last.status === "restart") return last;
  return { status: "complete", changed: first.changed || last.changed, notices: [...notices, ...last.notices] };
}

function isItem(ref: string): boolean { return /^refs\/arc\/(?:history\/)?(?:work|cohort)\//u.test(ref); }

/** Replace named history observations with only the exact tips this fetch reported. */
export function captureFetchedHistories(incoming: Map<string, string>, histories: readonly HistoryRef[], remote: string,
  fetched: Extract<FetchOutcome, { status: "refs" }>): void {
  for (const history of histories) incoming.delete(history);
  for (const row of fetched.refs) {
    if (row.flag === "!" || /^0+$/u.test(row.next)) continue;
    const canonical = row.ref.replace(`refs/arc-remotes/${remote}/`, "refs/arc/");
    if (histories.includes(canonical as HistoryRef)) incoming.set(canonical, row.next);
  }
}

function lifecycleRoutes(held: ReadonlyMap<string, string>, items: ReadonlyMap<string, string>,
  reopens: ReadonlyMap<string, string>): Map<string, RefMergeRoute> {
  const routes = new Map<string, RefMergeRoute>();
  for (const ref of items.keys()) {
    const reopening = reopens.get(ref);
    if (reopening) { routes.set(ref, { ref, source: reopening, reopening: true }); continue; }
    const history = ref.replace(/^refs\/arc\/(work|cohort)\//u, "refs/arc/history/$1/");
    if (history !== ref && !held.has(ref) && held.has(history)) {
      routes.set(ref, { ref: history, source: history, currentSide: "local" });
    }
    const live = ref.replace("refs/arc/history/", "refs/arc/");
    if (live !== ref && !held.has(ref) && held.has(live)) routes.set(ref, { ref: live, source: live, reopening: true });
  }
  return routes;
}
