/** Live UID reads resolve slug paths from metadata and pin their object basis. */
import { corruptRef } from "./namespace-health.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath, holdsNoRecord, type StoredRecordHome } from "../stored-path.js";
import type { StoreRecord } from "../read.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject } from "./batch-read.js";
import { canonicalPrimaryKind, readRefMetadata, type RefMetadata } from "./metadata.js";
import { decodeRecord, refOwner, rootFamily } from "./codec.js";
import { conflictParentQuery, readOpenConflicts } from "./conflicts-read.js";
import { checkRefKey } from "./path-admission.js";
import { absentRefRecord, refRecordAbsence } from "./record-absence.js";
import { resolveRefPointObject } from "./point-object.js";
import { missingRefObjects } from "./missing-objects.js";

/** Read the canonical slug before choosing paths, checking it against the pinned tip. */
export async function readUidRefRecord(context: RefBackendContext, requested: RecordReference): Promise<StoreResult<StoreRecord> | null> {
  if (!liveUidReference(context, requested)) return null;
  const shell = expandStoredPath(requested, { registry: context.registry });
  for (;;) {
    const result = await readUidAttempt(context, requested, shell);
    if (result !== "retry") return result;
  }
}

async function readUidAttempt(context: RefBackendContext, requested: RecordReference,
  shell: StoredRecordHome): Promise<StoreResult<StoreRecord> | null | "retry"> {
  const metadataQuery = `${shell.ref}:${shell.metadataPath}`;
  const captured = await readBatchObjects(context, [shell.ref, metadataQuery]);
  const tip = captured.get(shell.ref);
  if (tip?.type !== "commit") return null;
  const objectMetadata = captured.get(metadataQuery);
  const read = objectMetadata ? readRefMetadata(shell.ref, objectMetadata) : { kind: "missing" } as const;
  if (read.kind !== "parsed") return unreadableUidTip(context, requested, shell, tip.oid, objectMetadata);
  const metadata = read.metadata;

  const reference = canonicalUidReference(context, requested, shell.ref, metadata);
  const home = expandStoredPath(reference, { registry: context.registry });
  const recordQuery = `${tip.oid}:${home.path}`, pinnedMetadata = `${tip.oid}:${home.metadataPath}`;
  const conflictsQuery = `${tip.oid}:${home.root}conflicts`;
  const parentQuery = conflictParentQuery(tip.oid, home.root);
  const objects = await readBatchObjects(context, [pinnedMetadata, recordQuery, conflictsQuery, parentQuery]);
  if (objects.get(pinnedMetadata)?.oid !== captured.get(metadataQuery)?.oid) return "retry";
  const invalid = checkRefKey(reference, context.registry);
  if (invalid) return { status: "refused", refusal: invalid };
  const object = objects.get(recordQuery);
  if (object?.type !== "blob") return refRecordAbsence(context, reference, home, tip.oid);
  return readUidContent(context, reference, home, { object, metadata, conflicts: objects.get(conflictsQuery), parent: objects.get(parentQuery) });
}

async function readUidContent(context: RefBackendContext, reference: RecordReference, home: StoredRecordHome,
  captured: { object: BatchObject; metadata: RefMetadata; conflicts: BatchObject | null | undefined; parent: BatchObject | null | undefined }): Promise<StoreResult<StoreRecord>> {
  const conflicts = await readOpenConflicts(context, reference, captured.conflicts, { ...home, parent: captured.parent });
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

/** Pin failed ref-name queries before classifying them; a record-free tree without metadata establishes absence. */
async function unreadableUidTip(context: RefBackendContext, reference: RecordReference, shell: StoredRecordHome,
  tip: string, first: BatchObject | null | undefined): Promise<StoreResult<StoreRecord> | "retry"> {
  const query = `${tip}:${shell.metadataPath}`;
  const pinned = (await readBatchObjects(context, [query])).get(query);
  if (pinned?.oid !== first?.oid) return "retry";
  const resolved = await resolveRefPointObject(context, { ref: shell.ref, tip, path: shell.metadataPath }, pinned);
  if (resolved.kind === "missing") return { status: "refused", refusal: missingRefObjects(shell.ref, { reference, historyRefs: [] }) };
  if (resolved.kind === "absent" && holdsNoRecord(shell, resolved.entries.map(({ path }) => path))) return absentRefRecord(reference);
  return { status: "refused", refusal: corruptRef(shell.ref) };
}
