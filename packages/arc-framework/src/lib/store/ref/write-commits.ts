/** Build the write commit and its separately attributed conflict-record commit. */

import { randomUUID } from "node:crypto";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { RefChange } from "../../git/ref-transaction.js";
import type { BatchInput, WriteResult } from "../write.js";
import type { RecordReference } from "../identity.js";
import { RecordReferenceSchema } from "../identity.js";
import { ConflictRecordSchema } from "../conflict.js";
import { renderStoreCommitMessage } from "../commit-provenance.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { CapturedWriteGroup } from "./write-current.js";
import type { RefTreeEntry } from "./batch-read.js";
import type { PreparedRefMutation } from "./write-merge.js";
import { writeRefBlob, writeRefTree } from "./tree-write.js";
import { refFormatKey } from "./format-key.js";
import type { RefWriteTarget } from "./write-resolution.js";

/** Mutable prepared tree with the original entries retained for no-op comparison. */
export interface RefWriteGroup extends CapturedWriteGroup { original: Map<string, RefTreeEntry> }

/** Construct unpublished commits for every changed ref, preserving caller result order. */
export async function prepareRefCommits(context: RefBackendContext, writes: readonly PreparedRefMutation[],
  targets: readonly RefWriteTarget[],
  groups: ReadonlyMap<string, RefWriteGroup>, tips: ReadonlyMap<string, string>,
  provenance: BatchInput["provenance"], batchId: string, results: WriteResult[]): Promise<RefChange[]> {
  const changes: RefChange[] = [];
  const identity = await context.identity();
  const actor = identity === null ? undefined : await context.actor(identity);
  for (const [ref, group] of groups) {
    const selected = writes.filter((write) => write.home.ref === ref);
    const first = targets.find(({ home }) => home.ref === ref);
    if (!first) throw new Error("A changed ref has no mutation");
    if (selected.length === 0 && group.original.size === 0) continue;
    const path = first.home.metadataPath;
    group.entries.set(path, { path, mode: "100644", oid: await writeRefBlob(context, canonicalize(group.metadata)) });
    const clashes = selected.some((write) => write.conflicts.length > 0);
    if (!clashes && unchangedGroup(group)) continue;
    const parent = tips.get(ref);
    let next = await commitGroup(context, group, parent, provenance, first.reference, batchId, actor);
    if (clashes) {
      await fileGroupConflicts(context, group, selected, writes, results);
      group.entries.set(path, { path, mode: "100644", oid: await writeRefBlob(context, canonicalize(group.metadata)) });
      next = await commitGroup(context, group, next, { ...provenance, verb: "merge" }, first.reference, batchId, actor);
    }
    changes.push({ ref, next, expected: parent ?? null });
  }
  return changes;
}

async function fileGroupConflicts(context: RefBackendContext, group: RefWriteGroup, selected: readonly PreparedRefMutation[],
  writes: readonly PreparedRefMutation[], results: WriteResult[]): Promise<void> {
  for (const write of selected) {
    const result = results[writes.indexOf(write)];
    if (!result) throw new Error("A prepared write has no result");
    result.conflicts = await fileConflicts(context, group, write);
  }
}

async function commitGroup(context: RefBackendContext, group: RefWriteGroup, parent: string | undefined,
  provenance: BatchInput["provenance"], reference: RecordReference, batchId: string, actor: string | undefined): Promise<string> {
  const tree = await writeRefTree(context, group.entries.values());
  const { stdout } = await context.exec("git", ["commit-tree", tree, ...(parent ? ["-p", parent] : []),
    "-m", renderStoreCommitMessage(provenance, reference, batchId, actor)], { cwd: context.checkoutRoot });
  return stdout.trim();
}

async function fileConflicts(context: RefBackendContext, group: RefWriteGroup, write: PreparedRefMutation): Promise<RecordReference[]> {
  const references: RecordReference[] = [];
  for (const clash of write.conflicts) {
    const reference = RecordReferenceSchema.parse({ owner: write.mutation.reference.owner,
      kind: `${write.mutation.reference.kind.split("/")[0]}/conflict-record`, key: randomUUID() });
    const home = expandStoredPath(reference, { registry: context.registry });
    if (home.ref !== write.home.ref) throw new Error("A conflict record escaped its subject's ref");
    const content = canonicalize(ConflictRecordSchema.parse(clash));
    group.entries.set(home.path, { path: home.path, mode: "100644", oid: await writeRefBlob(context, content) });
    group.metadata.formats[refFormatKey(reference)] = context.registry[reference.kind].formatVersion;
    references.push(reference);
  }
  return references;
}

function unchangedGroup(group: RefWriteGroup): boolean {
  return group.entries.size === group.original.size && [...group.entries].every(([path, entry]) => {
    const before = group.original.get(path);
    return before?.oid === entry.oid && before.mode === entry.mode;
  });
}
