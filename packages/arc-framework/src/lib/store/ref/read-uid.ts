/** Two-process live UID reads resolve slug paths from metadata and pin their object basis. */
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { StoreRecord } from "../read.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects } from "./batch-read.js";
import { metadataFailure, parseRefMetadata, type RefMetadata } from "./metadata.js";
import { decodeRecord, refOwner, rootFamily } from "./codec.js";
import { readOpenConflicts } from "./conflicts-read.js";
import { checkRefKey } from "./path-admission.js";

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
    if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: shell.ref, ...metadataFailure(shell.ref) } };
    const reference = canonicalUidReference(context, requested, shell.ref, metadata);
    const home = expandStoredPath(reference, { registry: context.registry });
    const recordQuery = `${tip.oid}:${home.path}`, pinnedMetadata = `${tip.oid}:${home.metadataPath}`;
    const conflictsQuery = `${tip.oid}:${home.root}conflicts`;
    const objects = await readBatchObjects(context, [pinnedMetadata, recordQuery, conflictsQuery]);
    if (objects.get(pinnedMetadata)?.oid !== captured.get(metadataQuery)?.oid) continue;
    const invalid = checkRefKey(reference, context.registry);
    if (invalid) return { status: "refused", refusal: invalid };
    const object = objects.get(recordQuery);
    if (object?.type !== "blob") return { status: "refused", refusal: { code: "not-found", class: "recoverable", reference,
      condition: "The record is not present in local state", remedy: { text: "Pull state or create the record, then retry." } } };
    const conflicts = await readOpenConflicts(context, reference, objects.get(conflictsQuery));
    const record = decodeRecord(context, reference, object, metadata, home.path, conflicts);
    return "reference" in record ? { status: "ok", result: record } : { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
      reference, rule: record.condition, condition: record.condition, remedy: record.remedy } };
  }
}

function liveUidReference(context: RefBackendContext, reference: RecordReference): boolean {
  return ["work-item", "cohort"].includes(rootFamily(context.registry[reference.kind].family)) && "uid" in reference.owner && reference.owner.uid !== undefined;
}

function canonicalUidReference(context: RefBackendContext, requested: RecordReference, ref: string, metadata: RefMetadata): RecordReference {
  const kind = ["work-item/meta", "work-item/record"].includes(requested.kind) ? metadata.primary?.role ?? requested.kind : requested.kind;
  return RecordReferenceSchema.parse({ ...requested, kind, owner: refOwner(ref, context.registry[requested.kind].family, metadata) });
}
