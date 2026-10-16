/** Read open clashes beside their target without adding processes to a listing. */

import { ConflictRecordSchema } from "../conflict.js";
import { RecordReferenceSchema, sameReference, type RecordReference } from "../identity.js";
import type { StoreRecord } from "../read.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject } from "./batch-read.js";

/** Read the conflict blobs named by the tree captured with a direct record read. */
export async function readOpenConflicts(context: RefBackendContext, target: RecordReference,
  tree: BatchObject | null | undefined): Promise<RecordReference[]> {
  if (tree?.type !== "tree") return [];
  const entries = conflictTreeEntries(tree);
  const objects = await readBatchObjects(context, entries.map((entry) => entry.oid));
  const conflicts: RecordReference[] = [];
  for (const entry of entries) {
    const object = objects.get(entry.oid);
    if (object?.type !== "blob" || !namesTarget(object.bytes, target)) continue;
    conflicts.push(RecordReferenceSchema.parse({ owner: target.owner,
      kind: `${target.kind.split("/")[0]}/conflict-record`, key: entry.key }));
  }
  return conflicts;
}

/** Attach every target's open conflict references from the listing's already-read records. */
export function attachOpenConflicts(records: readonly StoreRecord[]): StoreRecord[] {
  const conflicts = records.filter((record) => record.reference.kind.endsWith("/conflict-record"))
    .map((record) => ({ reference: record.reference, target: conflictTarget(new TextEncoder().encode(record.content)) }));
  return records.map((record) => ({ ...record, conflicts: conflicts.filter((conflict) =>
    conflict.target && sameReference(conflict.target, record.reference)).map((conflict) => conflict.reference) }));
}

function namesTarget(bytes: Uint8Array, target: RecordReference): boolean {
  const record = conflictTarget(bytes);
  return record !== null && sameReference(record, target);
}

/** Decode the target of a typed conflict independently of its containing path. */
export function conflictTarget(bytes: Uint8Array): RecordReference | null {
  let content: unknown;
  try { content = JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
  const parsed = ConflictRecordSchema.safeParse(content);
  return parsed.success ? parsed.data.record : null;
}

function conflictTreeEntries(tree: BatchObject): { key: string; oid: string }[] {
  const entries: { key: string; oid: string }[] = [];
  const oidBytes = tree.oid.length / 2;
  let cursor = 0;
  while (cursor < tree.bytes.length) {
    const space = tree.bytes.indexOf(32, cursor);
    const end = tree.bytes.indexOf(0, space + 1);
    if (space < cursor || end < 0 || end + 1 + oidBytes > tree.bytes.length) throw new Error("Malformed conflict tree");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(tree.bytes.subarray(space + 1, end));
    if (name.endsWith(".json")) entries.push({ key: name.slice(0, -5),
      oid: Buffer.from(tree.bytes.subarray(end + 1, end + 1 + oidBytes)).toString("hex") });
    cursor = end + 1 + oidBytes;
  }
  return entries;
}
