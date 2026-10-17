/** Build the write commit and its separately attributed conflict-record commit. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { ReadPlacement } from "../placement.js";
import type { RefChange } from "../../git/ref-transaction.js";
import type { BatchInput } from "../write.js";
import type { RecordReference } from "../identity.js";
import { renderStoreCommitMessage } from "../commit-provenance.js";
import type { RefBackendContext } from "./context.js";
import type { CapturedWriteGroup } from "./write-current.js";
import type { RefTreeEntry } from "./batch-read.js";
import type { PreparedRefMutation } from "./write-merge.js";
import { writeRefBlob, writeRefTree } from "./tree-write.js";
import type { RefWriteTarget } from "./write-resolution.js";

/** Mutable prepared tree with the original entries retained for no-op comparison. */
export interface RefWriteGroup extends CapturedWriteGroup { original: Map<string, RefTreeEntry>; readPlacement?: ReadPlacement; viewRef?: string; retired?: true }

/** Construct each changed ref's write commit and optional conflict commit. */
export async function prepareRefCommits(context: RefBackendContext, writes: readonly PreparedRefMutation[],
  targets: readonly RefWriteTarget[],
  groups: ReadonlyMap<string, RefWriteGroup>, completed: ReadonlyMap<string, RefWriteGroup>, tips: ReadonlyMap<string, string>,
  provenance: BatchInput["provenance"], batchId: string): Promise<RefChange[]> {
  const changes: RefChange[] = [];
  const identity = await context.identity();
  const actor = identity === null ? undefined : await context.actor(identity);
  for (const [ref, group] of groups) {
    const selected = writes.filter((write) => write.home.ref === ref);
    const first = targets.find(({ home }) => home.ref === ref);
    if (!first) throw new Error("A changed ref has no mutation");
    if (selected.length === 0 && group.original.size === 0 && !group.retired) continue;
    const path = first.home.metadataPath;
    await serializeRefMetadata(context, group, path);
    const clashes = selected.some((write) => write.conflicts.length > 0);
    if (!clashes && unchangedGroup(group)) continue;
    const parent = tips.get(ref);
    let next = await commitRefTree(context, group.entries.values(), parent, provenance, first.reference, batchId, actor);
    if (clashes) {
      const final = completed.get(ref);
      if (!final) throw new Error("A ref with staged conflicts has no final tree");
      await serializeRefMetadata(context, final, path);
      next = await commitRefTree(context, final.entries.values(), next, { ...provenance, verb: "merge" }, first.reference, batchId, actor);
    }
    changes.push({ ref, next, expected: parent ?? null });
  }
  return changes;
}

/** Commit a prepared entry set with the same structured provenance on every lifecycle ref. */
export async function commitRefTree(context: RefBackendContext, entries: Iterable<RefTreeEntry>, parent: string | undefined,
  provenance: BatchInput["provenance"], reference: RecordReference, batchId: string, actor: string | undefined): Promise<string> {
  const tree = await writeRefTree(context, entries);
  const { stdout } = await context.exec("git", ["commit-tree", tree, ...(parent ? ["-p", parent] : []),
    "-m", renderStoreCommitMessage(provenance, reference, batchId, actor)], { cwd: context.checkoutRoot });
  return stdout.trim();
}

async function serializeRefMetadata(context: RefBackendContext, group: RefWriteGroup, path: string): Promise<void> {
  if (!group.retired) group.entries.set(path, { path, mode: "100644", oid: await writeRefBlob(context, canonicalize(group.metadata)) });
}

function unchangedGroup(group: RefWriteGroup): boolean {
  if (group.retired) return false;
  return group.entries.size === group.original.size && [...group.entries].every(([path, entry]) => {
    const before = group.original.get(path);
    return before?.oid === entry.oid && before.mode === entry.mode;
  });
}
