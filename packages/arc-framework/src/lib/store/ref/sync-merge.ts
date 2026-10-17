/** Reconcile captured state ref sets under caller-selected locks and publication scopes. */

import { randomUUID } from "node:crypto";
import { renderStoreCommitMessage } from "../commit-provenance.js";
import { readObjectFormat } from "./manifest.js";
import { mergeSyncTree, type SyncMergedTree } from "./sync-tree.js";
import { writeRefTree } from "./tree-write.js";
import type { RefStorePorts } from "../ports.js";
import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import { commitRefStep, type RefCommitMode } from "./commit-step.js";
import { withRefLocks } from "./write-locks.js";
import { readSyncRefs, syncRefIsAncestor } from "./sync-graph.js";
import { readSyncHistoryQuarters, prepareSyncHistoryFastForward, prepareSyncHistoryQuarters, unchangedSyncHistoryQuarters } from "./sync-history.js";
import { observeSyncEndedConflicts } from "./sync-ended-conflicts.js";
import { commitRefTree } from "./write-commits.js";
import { updateRefTransaction, type RefChange } from "../../git/ref-transaction.js";

/** Reuse the same merge over ordinary refs or a caller's isolated destination refs. */
export interface RefMergeOptions {
  lock: RefStorePorts["lock"];
  routes?: ReadonlyMap<string, RefMergeRoute>;
  priorState?: ReadonlyMap<string, string>;
  incomingState?: ReadonlyMap<string, string>;
  commitMode?: RefCommitMode;
  targetRef?: (canonical: string) => string;
  onApplied?: (context: RefBackendContext, ref: string, before: string | null, after: string, notices: readonly PullNotice[]) => Promise<void>;
}
/** One explicit lifecycle destination and the held source it replaces. */
export interface RefMergeRoute { ref: string; source: string; currentSide?: "local" | "incoming"; reopening?: boolean }

/** A changed basis asks the caller to release locks and capture its sets again. */
export type RefMergeResult = { status: "complete"; changed: boolean; notices: PullNotice[] } | { status: "restart" };

/** Merge exact incoming tips into a captured local set, preserving local first-parent ancestry. */
export async function mergeRefSets(context: RefBackendContext, local: ReadonlyMap<string, string>, incoming: ReadonlyMap<string, string>,
  options: RefMergeOptions): Promise<RefMergeResult> {
  let changed = false;
  const notices: PullNotice[] = [];
  for (const [incomingRef, next] of [...incoming].sort(([left], [right]) => left.localeCompare(right))) {
    const route = options.routes?.get(incomingRef);
    const ref = route?.ref ?? incomingRef;
    const target = options.targetRef?.(ref) ?? ref;
    const source = route?.source ?? ref;
    const sourceTarget = options.targetRef?.(source) ?? source;
    const quarters = await readSyncHistoryQuarters(context, ref, local, [next]);
    const result = await withRefLocks({ ...context, lock: options.lock }, [target, sourceTarget, ...quarters.map(({ ref }) => options.targetRef?.(ref) ?? ref)], async (): Promise<RefMergeResult> => {
      const current = (await readSyncRefs(context, sourceTarget)).get(sourceTarget) ?? null;
      if (current !== (local.get(source) ?? null)) return { status: "restart" };
      if (source === ref && (current === next || current && await syncRefIsAncestor(context, next, current))) return { status: "complete", changed: false, notices: [] };
      if (!await unchangedSyncHistoryQuarters(context, quarters, options.targetRef)) return { status: "restart" };
      const batchId = randomUUID();
      const staged = { ...context, blobStage: { format: await readObjectFormat(context), blobs: new Map<string, Uint8Array>() } };
      let tree: SyncMergedTree | undefined;
      let parents = [next];
      if (current && !await syncRefIsAncestor(context, current, next)) {
        const merged = await mergeSyncTree(staged, ref, current, next, local, { currentSide: route?.currentSide, incoming: options.incomingState ?? incoming, priorState: options.priorState, batchId, reopening: route?.reopening });
        if (merged.status === "refused") return { status: "complete", changed: false, notices: [{
          kind: "namespace-corrupt", ref, condition: merged.refusal.condition, remedy: merged.refusal.remedy,
        }] };
        tree = merged.result; parents = [current, next];
      } else {
        const prepared = await prepareSyncHistoryFastForward(staged, ref, next, quarters, batchId);
        if (prepared.status === "refused") return { status: "complete", changed: false, notices: [{
          kind: "namespace-corrupt", ref, condition: prepared.refusal.condition, remedy: prepared.refusal.remedy,
        }] };
        tree = prepared.result;
      }
      const prepared = tree;
      if (prepared?.metadata) await prepareSyncHistoryQuarters(staged, quarters, prepared);
      const applied = [...prepared?.notices ?? [], ...await observeSyncEndedConflicts(staged, ref, next, local, prepared)];
      let publishedTip = next;
      const refreshed: { ref: string; before: string; after: string }[] = [];
      const committed = await commitRefStep(staged, async (physical) => {
        const tip = prepared ? await commitSyncMerge(physical, prepared, parents, batchId) : next;
        publishedTip = tip;
        const changes: RefChange[] = [{ ref: target, next: tip, expected: local.get(ref) ?? null }];
        if (source !== ref && current) changes.push({ ref: sourceTarget, delete: true, expected: current });
        if (prepared) for (const quarter of quarters) {
          const identity = await physical.identity(), actor = identity === null ? undefined : await physical.actor(identity);
          const next = await commitRefTree(physical, quarter.entries.values(), quarter.tip, { verb: "sync", lifecycleAction: "merge" }, prepared.reference, batchId, actor);
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
    if (result.status === "restart") return result;
    changed ||= result.changed;
    notices.push(...result.notices);
  }
  return { status: "complete", changed, notices };
}

async function commitSyncMerge(context: RefBackendContext, prepared: SyncMergedTree, parents: readonly string[], batchId: string): Promise<string> {
  const tree = await writeRefTree(context, prepared.entries.values());
  const identity = await context.identity(), actor = identity === null ? undefined : await context.actor(identity);
  const { stdout } = await context.exec("git", ["commit-tree", tree, ...parents.flatMap((parent) => ["-p", parent]), "-m",
    renderStoreCommitMessage({ verb: "sync", lifecycleAction: "merge" }, prepared.reference, batchId, actor)], { cwd: context.checkoutRoot });
  return stdout.trim();
}
