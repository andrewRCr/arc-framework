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
import { readSyncHistoryQuarters, prepareSyncHistoryQuarters, unchangedSyncHistoryQuarters } from "./sync-history.js";
import { commitRefTree } from "./write-commits.js";
import { updateRefTransaction, type RefChange } from "../../git/ref-transaction.js";

/** Reuse the same merge over ordinary refs or a caller's isolated destination refs. */
export interface RefMergeOptions {
  lock: RefStorePorts["lock"];
  commitMode?: RefCommitMode;
  targetRef?: (canonical: string) => string;
  onApplied?: (context: RefBackendContext, ref: string, before: string | null, after: string, notices: readonly PullNotice[]) => Promise<void>;
}
/** A changed basis asks the caller to release locks and capture its sets again. */
export type RefMergeResult = { status: "complete"; changed: boolean; notices: PullNotice[] } | { status: "restart" };

/** Merge exact incoming tips into a captured local set, preserving local first-parent ancestry. */
export async function mergeRefSets(context: RefBackendContext, local: ReadonlyMap<string, string>, incoming: ReadonlyMap<string, string>,
  options: RefMergeOptions): Promise<RefMergeResult> {
  let changed = false;
  const notices: PullNotice[] = [];
  for (const [incomingRef, next] of [...incoming].sort(([left], [right]) => left.localeCompare(right))) {
    const ended = incomingRef.replace(/^refs\/arc\/(work|cohort)\//u, "refs/arc/history/$1/");
    const ending = ended !== incomingRef && !local.has(incomingRef) && local.has(ended);
    const live = incomingRef.replace("refs/arc/history/", "refs/arc/");
    const reopening = live !== incomingRef && !local.has(incomingRef) && local.has(live);
    const ref = ending ? ended : reopening ? live : incomingRef;
    const target = options.targetRef?.(ref) ?? ref;
    const quarters = await readSyncHistoryQuarters(context, ref, local);
    const result = await withRefLocks({ ...context, lock: options.lock }, [target, ...quarters.map(({ ref }) => options.targetRef?.(ref) ?? ref)], async (): Promise<RefMergeResult> => {
      const current = (await readSyncRefs(context, target)).get(target) ?? null;
      if (current !== (local.get(ref) ?? null)) return { status: "restart" };
      if (current === next || current && await syncRefIsAncestor(context, next, current)) return { status: "complete", changed: false, notices: [] };
      if (!await unchangedSyncHistoryQuarters(context, quarters, options.targetRef)) return { status: "restart" };
      const batchId = randomUUID();
      const staged = { ...context, blobStage: { format: await readObjectFormat(context), blobs: new Map<string, Uint8Array>() } };
      let tree: SyncMergedTree | undefined;
      if (current && !await syncRefIsAncestor(context, current, next)) {
        const merged = await mergeSyncTree(staged, ref, current, next, local, { currentSide: ending ? "local" : "incoming", incoming, batchId, reopening });
        if (merged.status === "refused") return { status: "complete", changed: false, notices: [{
          kind: "namespace-corrupt", ref, condition: merged.refusal.condition, remedy: merged.refusal.remedy,
        }] };
        tree = merged.result;
      }
      const prepared = tree;
      if (prepared && quarters.length) await prepareSyncHistoryQuarters(staged, quarters, prepared);
      let publishedTip = next;
      const refreshed: { ref: string; before: string; after: string }[] = [];
      const committed = await commitRefStep(staged, async (physical) => {
        const tip = prepared && current ? await commitSyncMerge(physical, prepared, current, next, batchId) : next;
        publishedTip = tip;
        const changes: RefChange[] = [{ ref: target, next: tip, expected: current }];
        if (prepared) for (const quarter of quarters) {
          const identity = await physical.identity(), actor = identity === null ? undefined : await physical.actor(identity);
          const next = await commitRefTree(physical, quarter.entries.values(), quarter.tip, { verb: "sync", lifecycleAction: "merge" }, prepared.reference, batchId, actor);
          changes.push({ ref: options.targetRef?.(quarter.ref) ?? quarter.ref, next, expected: quarter.tip });
          refreshed.push({ ref: quarter.ref, before: quarter.tip, after: next });
        }
        return updateRefTransaction(physical, changes, { cwd: context.checkoutRoot });
      }, options.commitMode);
      if (committed.status === "layout-changed" || committed.result.status === "lost-race") return { status: "restart" };
      await options.onApplied?.(context, ref, current, publishedTip, prepared?.notices ?? []);
      for (const quarter of refreshed) await options.onApplied?.(context, quarter.ref, quarter.before, quarter.after, []);
      return { status: "complete", changed: true, notices: prepared?.notices ?? [] };
    });
    if (result.status === "restart") return result;
    changed ||= result.changed;
    notices.push(...result.notices);
  }
  return { status: "complete", changed, notices };
}

async function commitSyncMerge(context: RefBackendContext, prepared: SyncMergedTree, local: string, incoming: string, batchId: string): Promise<string> {
  const tree = await writeRefTree(context, prepared.entries.values());
  const identity = await context.identity(), actor = identity === null ? undefined : await context.actor(identity);
  const { stdout } = await context.exec("git", ["commit-tree", tree, "-p", local, "-p", incoming, "-m",
    renderStoreCommitMessage({ verb: "sync", lifecycleAction: "merge" }, prepared.reference, batchId, actor)], { cwd: context.checkoutRoot });
  return stdout.trim();
}
