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
import { readCorruptLifecycleBatchRefs } from "./sync-corrupt.js";
import { withLifecycleEvidence } from "./sync-lifecycle-evidence.js";
import { holdLifecycleRef, primeLifecycleHolds } from "./sync-lifecycle-holds.js";

/** A failed supplemental fetch retains the shared merges already committed. */
export type LifecyclePullResult = RefMergeResult | { status: "fetch-failed"; fetched: Extract<FetchOutcome, { status: "unreachable" }> };

/** Keep by-name histories out of ordinary merging until end detection has read the pre-pull histories. */
export async function mergePulledRefState(context: RefBackendContext, incoming: Map<string, string>,
  designation: RefDesignation, remote: RefRemoteDesignation, requested: readonly HistoryRef[],
  options: RefMergeOptions & Pick<CapturedRefMergeOptions, "withheld">, previous: ReadonlyMap<string, string> = new Map()): Promise<LifecyclePullResult> {
  return mergeCapturedRefState(context, incoming, requested, { ...options, previous,
    acquireHistories: async (histories) => {
      const fetched = await fetchRefHistories(context, remote, designation, histories, context.syncDeadline?.signal);
      if (fetched.status === "unreachable") return { status: "fetch-failed", fetched };
      captureFetchedHistories(incoming, histories, remote.name, fetched);
      return { status: "complete", notices: fetched.notices };
    },
  });
}

/** A copy already acquired its complete source; a pull can acquire histories as lifecycle records reveal them. */
export interface CapturedRefMergeOptions extends RefMergeOptions {
  previous?: ReadonlyMap<string, string>;
  /** Refs a fetch could not apply, held in the source at their tips before it for end detection and never merged. */
  withheld?: ReadonlyMap<string, string>;
  /** A copy captures its isolated destination as logical state refs. */
  capture?: () => Promise<Map<string, string>>;
  acquireHistories?: (histories: readonly HistoryRef[]) => Promise<
    { status: "complete"; notices: PullNotice[] } | Extract<LifecyclePullResult, { status: "fetch-failed" }>>;
}

/** Reconcile a complete captured source over the selected destination without assuming a transport. */
export async function mergeCapturedRefState(context: RefBackendContext, incoming: Map<string, string>,
  requested: readonly HistoryRef[], options: CapturedRefMergeOptions): Promise<LifecyclePullResult> {
  context = withLifecycleEvidence(context);
  const previous = options.previous ?? new Map<string, string>();
  const published = refEndPublished(context, incoming, previous);
  let held = await captureMergeRefs(context, options);
  const { blocked, unavailable, corrupt } = await captureLifecycleHolds(context, held, incoming, previous);
  const merging = (ref: string): boolean => !blocked.has(ref) && !isWithheld(ref, incoming, options.withheld);
  const shared = new Map([...incoming].filter(([ref]) => !isItem(ref) && merging(ref)));
  const first = await mergeRefSets(context, held, shared, options);
  if (first.status === "restart") return first;
  let state = await captureMergeRefs(context, options);
  unavailable.push(...await primeLifecycleHolds(context, [held, state, incoming, previous], blocked));
  const completed = await readPendingArchiveHistories(context, held, state, incoming, blocked);
  let pending = await readPendingRefEnds(context, held, state, incoming, published, blocked);
  const required = new Map([...pending, ...completed].map((item) => [item.history, item]));
  const discovered = [...required.values()].filter(({ history }) => !requested.includes(history));
  const acquired = await acquireDiscoveredHistories(discovered.map(({ history }) => history), options);
  if (acquired.status === "fetch-failed") return acquired;
  first.notices.push(...acquired.notices);
  unavailable.push(...await primeLifecycleHolds(context, [incoming], blocked));
  const withdrawal = await withdrawEndBatches(context, held, state, incoming, options, published, blocked), withdrawn = withdrawal.result;
  if (withdrawn.status === "restart") return withdrawn;
  if (withdrawn.changed) {
    state = withdrawal.state; held = state;
    unavailable.push(...await primeLifecycleHolds(context, [state], blocked));
    pending = await readPendingRefEnds(context, held, state, incoming, published, blocked);
  }
  pending = await resolvePendingRefEnds(context, pending.filter(({ live, history }) => merging(live) && merging(history)), held, incoming);
  const histories = new Set<string>([...requested, ...discovered.map(({ history }) => history)]);
  const items = new Map([...incoming].filter(([ref]) => isItem(ref) && merging(ref)
    && !pending.some(({ live, history }) => ref === live || ref === history)
    && (!ref.startsWith("refs/arc/history/") || histories.has(ref))));
  const notices: PullNotice[] = [...unavailable, ...corrupt.notices, ...first.notices, ...withdrawn.notices];
  for (const { history, owner } of new Map([...pending, ...completed].map((item) => [item.history, item])).values()) {
    const tip = incoming.get(history);
    if (!merging(history)) continue;
    if (tip) items.set(history, tip);
    else notices.push({ kind: "end-pending", item: owner, ref: history,
      condition: "The end record is present but the state remote has no retained history for this item.",
      remedy: { text: `Have a clone holding ${history} push it back to the state remote, then pull again.` } });
  }
  const unblocked = (refs: ReadonlyMap<string, string>): Map<string, string> => new Map([...refs].filter(([ref]) => !isItem(ref) || merging(ref)));
  const reopens = await readPendingRefReopens(context, unblocked(held), unblocked(state), unblocked(incoming), published, blocked);
  const routes = lifecycleRoutes(held, items, reopens);
  for (const { live, history } of pending) if (held.has(live) && incoming.has(history)) {
    routes.set(history, pendingEndRoute(live, history));
  }
  const last = await mergeRefSets(context, state, items, { ...options, routes, incomingState: unblocked(incoming), priorState: unblocked(held) });
  if (last.status === "restart") return last;
  const doubled = await observeSyncEndedTwice(context, unblocked(await captureMergeRefs(context, options)), unblocked(incoming), published, blocked);
  const doubledUids = new Set(doubled.flatMap((notice) => notice.kind === "ended-twice" && "uid" in notice.item ? [notice.item.uid] : []));
  const unambiguous = [...notices, ...last.notices].filter((notice) => notice.kind !== "end-pending"
    || !("uid" in notice.item) || !doubledUids.has(notice.item.uid));
  return { status: "complete", changed: first.changed || withdrawn.changed || last.changed, notices: [...unambiguous, ...doubled] };
}

async function captureLifecycleHolds(context: RefBackendContext, held: ReadonlyMap<string, string>,
  incoming: ReadonlyMap<string, string>, previous: ReadonlyMap<string, string>): Promise<{
    blocked: Set<string>; unavailable: PullNotice[]; corrupt: Awaited<ReturnType<typeof readCorruptLifecycleBatchRefs>>;
  }> {
  const blocked = new Set<string>();
  const unavailable = await primeLifecycleHolds(context, [held, incoming, previous], blocked);
  const corrupt = await readCorruptLifecycleBatchRefs(context, held, incoming, previous, blocked);
  for (const ref of [...corrupt.refs].filter(isItem)) holdLifecycleRef(blocked, ref);
  return { blocked, unavailable, corrupt };
}

async function acquireDiscoveredHistories(histories: readonly HistoryRef[], options: CapturedRefMergeOptions): Promise<
  { status: "complete"; notices: PullNotice[] } | Extract<LifecyclePullResult, { status: "fetch-failed" }>> {
  if (!histories.length || !options.acquireHistories) return { status: "complete", notices: [] };
  const acquired = await options.acquireHistories(histories);
  if (acquired.status === "complete") options.onObserved?.(acquired.notices);
  return acquired;
}

async function withdrawEndBatches(context: RefBackendContext, held: Map<string, string>, state: Map<string, string>,
  incoming: ReadonlyMap<string, string>, options: RefMergeOptions, published: RefEndPublished,
  blocked: Set<string>): Promise<{ result: RefMergeResult; state: Map<string, string> }> {
  let changed = false;
  const notices: PullNotice[] = [];
  for (;;) {
    const result = await withdrawUnpublishedRefEnds(context, held, state, incoming, options, published, blocked);
    if (result.status === "restart") return { result, state };
    const before = blocked.size;
    for (const notice of result.notices) if (notice.kind === "namespace-corrupt") holdLifecycleRef(blocked, notice.ref);
    notices.push(...result.notices);
    if (!result.changed && before === blocked.size) return { result: { status: "complete", changed, notices }, state };
    if (result.changed) {
      changed = true; state = await captureMergeRefs(context, options); held = state;
      notices.push(...await primeLifecycleHolds(context, [state], blocked));
    }
  }
}

function isItem(ref: string): boolean { return /^refs\/arc\/(?:history\/)?(?:work|cohort)\//u.test(ref); }

function pendingEndRoute(live: string, history: string): RefMergeRoute {
  return { ref: history, source: live,
    ...live.startsWith("refs/arc/cohort/") ? { cohortEndRoute: { kind: "pending-end", live, history, liveSide: "local" } as const } : {} };
}

/** A withheld ref stays out of merges while the source still holds it at the tip it had before the fetch. */
export function isWithheld(ref: string, incoming: ReadonlyMap<string, string>, withheld: ReadonlyMap<string, string> = new Map()): boolean {
  const tip = withheld.get(ref);
  return tip !== undefined && incoming.get(ref) === tip;
}

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
      routes.set(ref, { ref: history, source: history, currentSide: "local",
        ...ref.startsWith("refs/arc/cohort/") ? { cohortEndRoute: { kind: "late-live", live: ref, history, liveSide: "incoming" } as const } : {} });
    }
    const live = ref.replace("refs/arc/history/", "refs/arc/");
    if (live !== ref && !held.has(ref) && held.has(live)) routes.set(ref, { ref: live, source: live, reopening: true });
  }
  return routes;
}

async function captureMergeRefs(context: RefBackendContext, options: CapturedRefMergeOptions): Promise<Map<string, string>> {
  return options.capture ? options.capture() : readSyncRefs(context, "refs/arc/");
}
