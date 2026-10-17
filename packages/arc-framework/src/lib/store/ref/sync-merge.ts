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
import { updateRefTransaction } from "../../git/ref-transaction.js";

/** Reuse the same merge over ordinary refs or a caller's isolated destination refs. */
export interface RefMergeOptions {
  lock: RefStorePorts["lock"];
  commitMode?: RefCommitMode;
  targetRef?: (canonical: string) => string;
}
/** A changed basis asks the caller to release locks and capture its sets again. */
export type RefMergeResult = { status: "complete"; changed: boolean; notices: PullNotice[] } | { status: "restart" };

/** Merge exact incoming tips into a captured local set, preserving local first-parent ancestry. */
export async function mergeRefSets(context: RefBackendContext, local: ReadonlyMap<string, string>, incoming: ReadonlyMap<string, string>,
  options: RefMergeOptions): Promise<RefMergeResult> {
  let changed = false;
  const notices: PullNotice[] = [];
  for (const [ref, next] of [...incoming].sort(([left], [right]) => left.localeCompare(right))) {
    const ended = ref.replace(/^refs\/arc\/(work|cohort)\//u, "refs/arc/history/$1/");
    if (ended !== ref && !local.has(ref) && local.has(ended)) continue;
    const target = options.targetRef?.(ref) ?? ref;
    const result = await withRefLocks({ ...context, lock: options.lock }, [target], async (): Promise<RefMergeResult> => {
      const current = (await readSyncRefs(context, target)).get(target) ?? null;
      if (current !== (local.get(ref) ?? null)) return { status: "restart" };
      if (current === next || current && await syncRefIsAncestor(context, next, current)) return { status: "complete", changed: false, notices: [] };
      const staged = { ...context, blobStage: { format: await readObjectFormat(context), blobs: new Map<string, Uint8Array>() } };
      let tree: SyncMergedTree | undefined;
      if (current && !await syncRefIsAncestor(context, current, next)) {
        const merged = await mergeSyncTree(staged, ref, current, next);
        if (merged.status === "refused") return { status: "complete", changed: false, notices: [{
          kind: "namespace-corrupt", ref, condition: merged.refusal.condition, remedy: merged.refusal.remedy,
        }] };
        tree = merged.result;
      }
      const prepared = tree;
      const committed = await commitRefStep(staged, async (physical) => {
        const tip = prepared && current ? await commitSyncMerge(physical, prepared, current, next) : next;
        return updateRefTransaction(physical, [{ ref: target, next: tip, expected: current }], { cwd: context.checkoutRoot });
      }, options.commitMode);
      if (committed.status === "layout-changed" || committed.result.status === "lost-race") return { status: "restart" };
      return { status: "complete", changed: true, notices: [] };
    });
    if (result.status === "restart") return result;
    changed ||= result.changed;
    notices.push(...result.notices);
  }
  return { status: "complete", changed, notices };
}

async function commitSyncMerge(context: RefBackendContext, prepared: SyncMergedTree, local: string, incoming: string): Promise<string> {
  const tree = await writeRefTree(context, prepared.entries.values());
  const identity = await context.identity(), actor = identity === null ? undefined : await context.actor(identity);
  const { stdout } = await context.exec("git", ["commit-tree", tree, "-p", local, "-p", incoming, "-m",
    renderStoreCommitMessage({ verb: "sync", lifecycleAction: "merge" }, prepared.reference, randomUUID(), actor)], { cwd: context.checkoutRoot });
  return stdout.trim();
}
