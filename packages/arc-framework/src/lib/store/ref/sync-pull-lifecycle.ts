/** Reconcile shared records before applying the item lifecycle moves those records describe. */

import type { FetchOutcome } from "../../git/fetch.js";
import type { HistoryRef } from "../refusal.js";
import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { readPendingArchiveHistories } from "./sync-archive-histories.js";
import { withdrawUnpublishedRefEnds } from "./sync-end-withdrawal.js";
import { observeSyncEndedTwice } from "./sync-ended-twice.js";
import { fetchRefHistories } from "./fetch.js";
import { readSyncRefs } from "./sync-graph.js";
import { mergeRefSets, type RefMergeOptions, type RefMergeResult, type RefMergeRoute } from "./sync-merge.js";
import { readPendingRefEnds, readPendingRefReopens, resolvePendingRefEnds, refEndPublished, type RefEndPublished } from "./sync-lifecycle.js";

/** A failed supplemental fetch retains the shared merges already committed. */
export type LifecyclePullResult = RefMergeResult | { status: "fetch-failed"; fetched: Extract<FetchOutcome, { status: "unreachable" }> };

/** Keep by-name histories out of ordinary merging until end detection has read the pre-pull histories. */
export async function mergePulledRefState(context: RefBackendContext, incoming: Map<string, string>,
  designation: RefDesignation, remote: RefRemoteDesignation, requested: readonly HistoryRef[],
  options: RefMergeOptions, previous: ReadonlyMap<string, string> = new Map()): Promise<LifecyclePullResult> {
  const published = refEndPublished(context, incoming, previous);
  let held = await readSyncRefs(context, "refs/arc/");
  const shared = new Map([...incoming].filter(([ref]) => !isItem(ref)));
  const first = await mergeRefSets(context, held, shared, options);
  if (first.status === "restart") return first;
  let state = await readSyncRefs(context, "refs/arc/");
  const completed = await readPendingArchiveHistories(context, held, state, incoming);
  let pending = await readPendingRefEnds(context, held, state, incoming, published);
  const required = new Map([...pending, ...completed].map((item) => [item.history, item]));
  const discovered = [...required.values()].filter(({ history }) => !requested.includes(history));
  if (discovered.length) {
    const fetched = await fetchRefHistories(context, remote, designation, discovered.map(({ history }) => history), context.syncDeadline?.signal);
    if (fetched.status === "unreachable") return { status: "fetch-failed", fetched };
    first.notices.push(...fetched.notices);
    options.onObserved?.(fetched.notices);
    captureFetchedHistories(incoming, discovered.map(({ history }) => history), remote.name, fetched);
  }
  const withdrawal = await withdrawEndBatches(context, held, state, incoming, options, published), withdrawn = withdrawal.result;
  if (withdrawn.status === "restart") return withdrawn;
  if (withdrawn.changed) {
    state = withdrawal.state; held = state;
    pending = await readPendingRefEnds(context, held, state, incoming, published);
  }
  pending = await resolvePendingRefEnds(context, pending, held, incoming);
  const histories = new Set<string>([...requested, ...discovered.map(({ history }) => history)]);
  const items = new Map([...incoming].filter(([ref]) => isItem(ref)
    && !pending.some(({ live, history }) => ref === live || ref === history)
    && (!ref.startsWith("refs/arc/history/") || histories.has(ref))));
  const notices: PullNotice[] = [...first.notices, ...withdrawn.notices];
  for (const { history, owner } of new Map([...pending, ...completed].map((item) => [item.history, item])).values()) {
    const tip = incoming.get(history);
    if (tip) items.set(history, tip);
    else notices.push({ kind: "end-pending", item: owner, ref: history,
      condition: "The end record is present but the state remote has no retained history for this item.",
      remedy: { text: `Have a clone holding ${history} push it back to the state remote, then pull again.` } });
  }
  const reopens = await readPendingRefReopens(context, held, state, incoming, published);
  const routes = lifecycleRoutes(held, items, reopens);
  for (const { live, history } of pending) if (held.has(live) && incoming.has(history)) {
    routes.set(history, { ref: history, source: live });
  }
  const last = await mergeRefSets(context, state, items, { ...options, routes, incomingState: incoming, priorState: held });
  if (last.status === "restart") return last;
  const doubled = await observeSyncEndedTwice(context, await readSyncRefs(context, "refs/arc/"), incoming, published);
  const doubledUids = new Set(doubled.flatMap((notice) => notice.kind === "ended-twice" && "uid" in notice.item ? [notice.item.uid] : []));
  const unambiguous = [...notices, ...last.notices].filter((notice) => notice.kind !== "end-pending"
    || !("uid" in notice.item) || !doubledUids.has(notice.item.uid));
  return { status: "complete", changed: first.changed || withdrawn.changed || last.changed, notices: [...unambiguous, ...doubled] };
}

async function withdrawEndBatches(context: RefBackendContext, held: Map<string, string>, state: Map<string, string>,
  incoming: ReadonlyMap<string, string>, options: RefMergeOptions, published: RefEndPublished): Promise<{ result: RefMergeResult; state: Map<string, string> }> {
  let changed = false;
  const notices: PullNotice[] = [];
  for (;;) {
    const result = await withdrawUnpublishedRefEnds(context, held, state, incoming, options, published);
    if (result.status === "restart") return { result, state };
    if (!result.changed) return { result: { status: "complete", changed, notices }, state };
    changed = true; notices.push(...result.notices);
    state = await readSyncRefs(context, "refs/arc/"); held = state;
  }
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
