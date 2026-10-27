/** Live UID reads resolve slug paths from metadata and pin their object basis. */
import { corruptRef } from "./namespace-health.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath, holdsNoRecord, type StoredRecordHome } from "../stored-path.js";
import type { StoreRecord } from "../read.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, readRefTrees, type BatchObject } from "./batch-read.js";
import { canonicalPrimaryKind, parseRefMetadata, type RefMetadata } from "./metadata.js";
import { decodeRecord, refOwner, rootFamily } from "./codec.js";
import { readOpenConflicts } from "./conflicts-read.js";
import { checkRefKey } from "./path-admission.js";
import { refRecordAbsence } from "./record-absence.js";

/** Read the canonical slug before choosing paths, checking it against the pinned tip. */
export async function readUidRefRecord(context: RefBackendContext, requested: RecordReference): Promise<StoreResult<StoreRecord> | null> {
  if (!liveUidReference(context, requested)) return null;
  const shell = expandStoredPath(requested, { registry: context.registry });
  for (;;) {
    const metadataQuery = `${shell.ref}:${shell.metadataPath}`;
    const captured = await readBatchObjects(context, [shell.ref, metadataQuery]);
    const tip = captured.get(shell.ref);
    if (tip?.type !== "commit") return null;
    const metadata = parseRefMetadata(captured.get(metadataQuery), shell.ref);
    if (!metadata) return unreadableUidTip(context, shell, tip.oid);

    const reference = canonicalUidReference(context, requested, shell.ref, metadata);
    const home = expandStoredPath(reference, { registry: context.registry });
    const recordQuery = `${tip.oid}:${home.path}`, pinnedMetadata = `${tip.oid}:${home.metadataPath}`;
    const conflictsQuery = `${tip.oid}:${home.root}conflicts`;
    const objects = await readBatchObjects(context, [pinnedMetadata, recordQuery, conflictsQuery]);
    if (objects.get(pinnedMetadata)?.oid !== captured.get(metadataQuery)?.oid) continue;
    const invalid = checkRefKey(reference, context.registry);
    if (invalid) return { status: "refused", refusal: invalid };
    const object = objects.get(recordQuery);
    if (object?.type !== "blob") return refRecordAbsence(context, reference, home, tip.oid);
    return readUidContent(context, reference, home, { object, metadata, conflicts: objects.get(conflictsQuery), tip: tip.oid });
  }
}

async function readUidContent(context: RefBackendContext, reference: RecordReference, home: StoredRecordHome,
  captured: { object: BatchObject; metadata: RefMetadata; conflicts: BatchObject | null | undefined; tip: string }): Promise<StoreResult<StoreRecord>> {
  const conflicts = await readOpenConflicts(context, reference, captured.conflicts, { ...home, tip: captured.tip });
  if (conflicts.status === "refused") return conflicts;
  const record = decodeRecord(context, reference, captured.object, captured.metadata, home.path, conflicts.result, undefined, { pointRead: true });
  return "reference" in record ? { status: "ok", result: record } : { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
    reference, rule: record.condition, condition: record.condition, remedy: record.remedy } };
}

function liveUidReference(context: RefBackendContext, reference: RecordReference): boolean {
  return ["work-item", "cohort"].includes(rootFamily(context.registry[reference.kind].family)) && "uid" in reference.owner && reference.owner.uid !== undefined;
}

function canonicalUidReference(context: RefBackendContext, requested: RecordReference, ref: string, metadata: RefMetadata): RecordReference {
  const kind = canonicalPrimaryKind(requested.kind, metadata);
  return RecordReferenceSchema.parse({ ...requested, kind, owner: refOwner(ref, context.registry[requested.kind].family, metadata) });
}

/** Without metadata, a tree holding no record falls through to the name read, which reads it as holding none. */
async function unreadableUidTip(context: RefBackendContext, shell: StoredRecordHome, tip: string): Promise<StoreResult<StoreRecord> | null> {
  const entries = (await readRefTrees(context, new Map([[shell.ref, tip]]))).get(shell.ref);
  return entries && holdsNoRecord(shell, entries.map(({ path }) => path)) ? null : { status: "refused", refusal: corruptRef(shell.ref, !entries) };
}
