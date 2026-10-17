/** Stage generated clashes for check views while retaining the write's own tree. */

import { randomUUID } from "node:crypto";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { ConflictRecordSchema } from "../conflict.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { WriteResult } from "../write.js";
import type { RefBackendContext } from "./context.js";
import type { RefWriteGroup } from "./write-commits.js";
import type { PreparedRefMutation } from "./write-merge.js";
import { writeRefBlob } from "./tree-write.js";
import { refFormatKey } from "./format-key.js";

/** Build final trees including fresh conflicts without changing the subject-only trees. */
export async function prepareRefConflicts(context: RefBackendContext, writes: readonly PreparedRefMutation[],
  groups: ReadonlyMap<string, RefWriteGroup>, results: WriteResult[]): Promise<Map<string, RefWriteGroup>> {
  const completed = new Map([...groups].map(([ref, group]) => [ref, { ...group, entries: new Map(group.entries), metadata: structuredClone(group.metadata) }]));
  for (const [index, write] of writes.entries()) {
    const group = completed.get(write.home.ref), result = results[index];
    if (!group || !result) throw new Error("A prepared conflict has no subject group or result");
    result.conflicts = await fileConflicts(context, group, write);
  }
  return completed;
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
