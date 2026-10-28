/** Reconcile captured state ref sets under caller-selected locks and publication scopes. */

import { appendStoreCreationReceipt } from "../commit-creation-receipt.js";
import { randomUUID } from "node:crypto";
import { renderStoreCommitMessage, renderEmptyArchiveMergeMessage } from "../commit-provenance.js";
import { readObjectFormat } from "./manifest.js";
import { mergeSyncTree, type SyncMergedTree, type SyncTreeMergeScope } from "./sync-tree.js";
import { writeRefTree } from "./tree-write.js";
import type { RefStorePorts } from "../ports.js";
import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import { commitRefStep, type RefCommitMode } from "./commit-step.js";
import { withRefLocks } from "./write-locks.js";
import { readSyncRefs, syncRefIsAncestor } from "./sync-graph.js";
import { readSyncHistoryQuarters, prepareSyncHistoryFastForward, prepareSyncHistoryQuarters, unchangedSyncHistoryQuarters,
  type SyncHistoryQuarter } from "./sync-history.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import { observeSyncEndedConflicts } from "./sync-ended-conflicts.js";
import { commitRefTree } from "./write-commits.js";
import { updateRefTransaction, type RefChange } from "../../git/ref-transaction.js";
import { isGitProcessError } from "../../git/process-error.js";
import { readBatchObjects } from "./batch-read.js";
import { corruptRef } from "./namespace-health.js";
import { isUnavailableGraphFailure } from "./history-graph.js";
import type { SyncCohortEndRoute } from "./sync-control-sources.js";

/** Reuse the same merge over ordinary refs or a caller's isolated destination refs. */
export interface RefMergeOptions {
  lock: RefStorePorts["lock"];
  routes?: ReadonlyMap<string, RefMergeRoute>;
  priorState?: ReadonlyMap<string, string>;
  incomingState?: ReadonlyMap<string, string>;
  commitMode?: RefCommitMode;
  targetRef?: (canonical: string) => string;
  onObserved?: (notices: readonly PullNotice[]) => void;
  onApplied?: (context: RefBackendContext, ref: string, before: string | null, after: string, notices: readonly PullNotice[]) => Promise<void>;
}
/** One explicit lifecycle destination and the held source it replaces. */
export interface RefMergeRoute { ref: string; source: string; currentSide?: "local" | "incoming"; reopening?: boolean; cohortEndRoute?: SyncCohortEndRoute }

/** A changed basis asks the caller to release locks and capture its sets again. */
export type RefMergeResult = { status: "complete"; changed: boolean; notices: PullNotice[] } | { status: "restart" };

/** Merge exact incoming tips into a captured local set, preserving local first-parent ancestry. */
export async function mergeRefSets(context: RefBackendContext, local: ReadonlyMap<string, string>, incoming: ReadonlyMap<string, string>,
  options: RefMergeOptions): Promise<RefMergeResult> {
  let changed = false;
  const notices: PullNotice[] = [];
  for (const [incomingRef, next] of [...incoming].sort(([left], [right]) => left.localeCompare(right))) {
    const ref = options.routes?.get(incomingRef)?.ref ?? incomingRef;
    let result: RefMergeResult;
    try { result = await mergeCapturedSyncRef(context, local, incoming, options, incomingRef, next); }
    catch (error) {
      if (!isGitProcessError(error) || !error.args.some(arg => arg === "merge-base" || arg === "log")
        || !await isUnavailableGraphFailure(context, error)) throw error;
      result = heldMerge(ref, corruptRef(ref, true));
    }
    if (result.status === "restart") return result;
    changed ||= result.changed;
    notices.push(...result.notices);
  }
  return { status: "complete", changed, notices };
}

async function mergeCapturedSyncRef(context: RefBackendContext, local: ReadonlyMap<string, string>,
  incoming: ReadonlyMap<string, string>, options: RefMergeOptions, incomingRef: string, next: string): Promise<RefMergeResult> {
  const route = options.routes?.get(incomingRef);
  const ref = route?.ref ?? incomingRef;
  const target = options.targetRef?.(ref) ?? ref;
  const source = route?.source ?? ref;
  const sourceTarget = options.targetRef?.(source) ?? source;
  const sourceTip = local.get(source);
  const endpoints = await readBatchObjects(context, [next, ...sourceTip ? [sourceTip] : []]);
  if ([...endpoints.values()].some(object => object?.type !== "commit")) return heldMerge(ref, corruptRef(ref, true));
  const captured = await readSyncHistoryQuarters(context, ref, local, [next]);
  const quarters = captured.status === "ok" ? captured.result.quarters : [];
  return await withRefLocks({ ...context, lock: options.lock }, [target, sourceTarget, ...quarters.map(({ ref }) => options.targetRef?.(ref) ?? ref)], async (): Promise<RefMergeResult> => {
    const current = (await readSyncRefs(context, sourceTarget)).get(sourceTarget) ?? null;
    if (current !== (local.get(source) ?? null)) return { status: "restart" };
    if (source === ref && (current === next || current && await syncRefIsAncestor(context, next, current))) return { status: "complete", changed: false, notices: [] };
    // Only a merge that moves the history must rebuild its folders, so only that waits for an unreadable quarter.
    if (captured.status === "refused") return heldMerge(ref, captured.refusal);
    if (!await unchangedSyncHistoryQuarters(context, quarters, options.targetRef)) return { status: "restart" };
    const batchId = randomUUID();
    const staged = { ...context, blobStage: { format: await readObjectFormat(context), blobs: new Map<string, Uint8Array>() } };
    const built = await prepareSyncMerge(staged, ref, current, next, local, quarters, { currentSide: route?.currentSide,
      incoming: options.incomingState ?? incoming, priorState: options.priorState, batchId, reopening: route?.reopening, ended: captured.result.latest,
      sourceRefs: { local: source, incoming: incomingRef }, cohortEndRoute: route?.cohortEndRoute });
    if (built.status === "refused") return heldMerge(ref, built.refusal);
    const { tree: prepared, parents, placementState } = built.result;
    if (prepared?.kind === "record" && prepared.metadata) {
      const refreshed = await prepareSyncHistoryQuarters(staged, quarters, prepared, placementState);
      if (refreshed.status === "refused") return heldMerge(ref, refreshed.refusal);
    }
    const applied = [...prepared?.notices ?? [], ...await observeSyncEndedConflicts(staged, ref, next, local, prepared)];
    let publishedTip = next;
    const refreshed: { ref: string; before: string; after: string }[] = [];
    const committed = await commitRefStep(staged, async (physical) => {
      const tip = prepared ? await commitSyncMerge(physical, prepared, parents, batchId) : next;
      publishedTip = tip;
      const changes: RefChange[] = [{ ref: target, next: tip, expected: local.get(ref) ?? null }];
      if (source !== ref && current) changes.push({ ref: sourceTarget, delete: true, expected: current });
      if (prepared?.kind === "record") for (const quarter of quarters) {
        const identity = await physical.identity(), actor = identity === null ? undefined : await physical.actor(identity);
        const next = await commitRefTree(physical, quarter.entries.values(), quarter.tip, { verb: "sync", lifecycleAction: "merge" }, prepared.reference, batchId, actor, { schemaVersion: 1, batchId, createdOwners: [] });
        changes.push({ ref: options.targetRef?.(quarter.ref) ?? quarter.ref, next, expected: quarter.tip });
        refreshed.push({ ref: quarter.ref, before: quarter.tip, after: next });
      }
      return updateRefTransaction(physical, changes, { cwd: context.checkoutRoot });
    }, options.commitMode);
    if (committed.status === "layout-changed" || committed.result.status === "lost-race") return { status: "restart" };
    await options.onApplied?.(context, ref, current, publishedTip, applied);
    for (const quarter of refreshed) await options.onApplied?.(context, quarter.ref, quarter.before, quarter.after, []);
    return { status: "complete", changed: true, notices: applied };
  });
}

/** Merge diverged tips, or stamp a fast-forward whose retained folders need a paired refresh. */
async function prepareSyncMerge(context: RefBackendContext, ref: string, current: string | null, next: string,
  local: ReadonlyMap<string, string>, quarters: readonly SyncHistoryQuarter[], scope: SyncTreeMergeScope & { batchId: string }):
  Promise<StoreResult<{ tree: SyncMergedTree | undefined; parents: string[]; placementState: ReadonlyMap<string, string> }>> {
  const incoming = scope.incoming ?? local;
  if (current && !await syncRefIsAncestor(context, current, next)) {
    const merged = await mergeSyncTree(context, ref, current, next, local, scope);
    return merged.status === "refused" ? merged : { status: "ok", result: { tree: merged.result, parents: [current, next],
      placementState: scope.currentSide === "local" ? local : incoming } };
  }
  const prepared = await prepareSyncHistoryFastForward(context, ref, next, quarters, scope.batchId, incoming, scope);
  return prepared.status === "refused" ? prepared : { status: "ok", result: { tree: prepared.result, parents: [next], placementState: incoming } };
}

function heldMerge(ref: string, refusal: StoreRefusal): RefMergeResult {
  return { status: "complete", changed: false, notices: [{ kind: "namespace-corrupt", ref, condition: refusal.condition, remedy: refusal.remedy }] };
}

async function commitSyncMerge(context: RefBackendContext, prepared: SyncMergedTree, parents: readonly string[], batchId: string): Promise<string> {
  const tree = await writeRefTree(context, prepared.entries.values());
  const identity = await context.identity(), actor = identity === null ? undefined : await context.actor(identity);
  const message = prepared.kind === "empty-archive" ? renderEmptyArchiveMergeMessage(prepared.archiveRef, batchId, actor)
    : renderStoreCommitMessage({ verb: "sync", lifecycleAction: "merge" }, prepared.reference, batchId, actor);
  const { stdout } = await context.exec("git", ["commit-tree", tree, ...parents.flatMap((parent) => ["-p", parent]), "-m",
    appendStoreCreationReceipt(message,
      { schemaVersion: 1, batchId, createdOwners: [] })], { cwd: context.checkoutRoot });
  return stdout.trim();
}
