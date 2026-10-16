/** Batched live record reads and family listings over captured local state refs. */

import type { ListInput, ListingOutcome, ListingDiagnostic, ReadInput, StoreRecord } from "../read.js";
import { RecordReferenceSchema, OwnerIdentitySchema, sameOwner, type RecordReference, type OwnerIdentity } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import type { FamilyId } from "../catalog.js";
import { FAMILY_REGISTRY } from "../registry.js";
import { readBatchObjects, readRefTips, readRefTrees, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { decodeRecord, decodeReference, lineageOwner, matchesFamilyRef, refOwner, rootFamily } from "./codec.js";
import { parseRefMetadata, metadataFailure, type RefMetadata } from "./metadata.js";
import type { RefBackendContext } from "./context.js";
import { saveCapturedManifest } from "./manifest.js";
import { recordDiagnostic } from "./content-read.js";
import { readOpenConflicts, attachOpenConflicts } from "./conflicts-read.js";

/** Read one live record, resolving a slug-only owner through one captured family scan. */
export async function readRefRecord(context: RefBackendContext, input: ReadInput): Promise<StoreResult<StoreRecord>> {
  let reference = input.reference;
  if (reference.owner.type === "person" && await context.identity() === null) {
    return missing(reference, "No arc.identity is configured for person-owned state", "Configure arc.identity, then retry.");
  }
  if (reference.owner.type !== "person" && !reference.owner.uid && reference.owner.type !== "project") {
    const listing = await listRefRecords(context, { family: context.registry[reference.kind].family });
    if (listing.status !== "ok" || listing.result.status !== "complete") return missing(reference);
    const resolved = listing.result.records.find((record) => record.reference.owner.name === reference.owner.name);
    if (!resolved) return missing(reference);
    reference = RecordReferenceSchema.parse({ ...reference, owner: resolved.reference.owner });
  }
  const home = expandStoredPath(reference, { registry: context.registry });
  const tips = await readRefTips(context);
  const tip = tips.get(home.ref);
  if (!tip) return missing(reference);
  const recordQuery = `${tip}:${home.path}`;
  const metadataQuery = `${tip}:${home.metadataPath}`;
  const conflictsQuery = `${tip}:${home.root}conflicts`;
  const objects = await readBatchObjects(context, [metadataQuery, recordQuery, conflictsQuery]);
  const object = objects.get(recordQuery);
  if (object?.type !== "blob") return missing(reference);
  const metadata = parseRefMetadata(objects.get(metadataQuery), home.ref);
  if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
    namespace: home.ref, ...metadataFailure(home.ref) } };
  const family = context.registry[reference.kind].family;
  const owner = family === "lineage" ? lineageOwner(metadata, reference.owner.type === "work-item" ? reference.owner.uid : undefined)
    : refOwner(home.ref, family, metadata);
  reference = RecordReferenceSchema.parse({ ...reference, owner });
  const conflicts = await readOpenConflicts(context, reference, objects.get(conflictsQuery));
  const record = decodeRecord(context, reference, object, metadata, home.path, conflicts);
  return "reference" in record ? { status: "ok", result: record } : { status: "refused", refusal: {
    code: "record-malformed", class: "recoverable", reference, rule: record.condition,
    condition: record.condition, remedy: record.remedy } };
}

/** List a registered family from one tip capture, tree check, recursive diff, and blob batch. */
export async function listRefRecords(context: RefBackendContext, input: ListInput): Promise<StoreResult<ListingOutcome>> {
  const identityMissing = FAMILY_REGISTRY[input.family].scope === "identity" && await context.identity() === null;
  const captured = await readRefTips(context);
  const asOf = await saveCapturedManifest(context, captured);
  if (identityMissing) return { status: "ok", result: { status: "absent", asOf } };
  const tips = new Map([...captured].filter(([ref]) => matchesFamilyRef(ref, input.family)));
  if (tips.size === 0) return { status: "ok", result: { status: "absent", asOf } };
  const trees = await readRefTrees(context, tips);
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map((entry) => entry.oid)))]);
  const groups = [...tips.keys()].map((ref) => {
    const entries = trees.get(ref);
    return entries ? decodeCapturedRef(context, input, ref, entries, objects) : unreadableRef(ref);
  });
  const records = groups.flatMap((group) => group.records);
  const diagnostics = groups.flatMap((group) => group.diagnostics);
  if (groups.length > 0 && groups.every((group) => group.unreadable)) return { status: "ok", result: { status: "unreadable",
    condition: diagnostics.map((diagnostic) => diagnostic.condition).join("; "),
    remedy: { text: diagnostics.map((diagnostic) => diagnostic.remedy.text).join(" ") } } };
  return { status: "ok", result: { status: "complete", records, diagnostics, missed: diagnostics.length > 0, asOf } };
}

interface DecodedRecords { records: StoreRecord[]; diagnostics: ListingDiagnostic[]; unreadable?: true }

function decodeCapturedRef(context: RefBackendContext, input: ListInput, ref: string,
  entries: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>): DecodedRecords {
  const records: StoreRecord[] = [];
  const diagnostics: ListingDiagnostic[] = [];
  const prototype = refPrototype(context, ref, input.family);
  const home = expandStoredPath(prototype, { registry: context.registry });
  if (entries.every((entry) => entry.path === home.metadataPath || entry.path.startsWith(home.manifestPath))) return { records, diagnostics };
  const metadata = capturedMetadata(home, entries, objects);
  if (!("formats" in metadata)) return metadata;
  const owner = refOwner(ref, input.family, metadata);
  for (const entry of entries) {
    if (entry.path === home.metadataPath || entry.path.startsWith(home.manifestPath)) continue;
    const record = decodeCapturedEntry(context, input.family, owner, entry, objects.get(entry.oid), metadata);
    if (!record) continue;
    if ("reference" in record) records.push(record); else diagnostics.push(record);
  }
  return { records: selectRecords(attachOpenConflicts(records), input), diagnostics };
}

function decodeCapturedEntry(context: RefBackendContext, family: FamilyId, owner: OwnerIdentity, entry: RefTreeEntry,
  object: BatchObject | null | undefined, metadata: RefMetadata): StoreRecord | ListingDiagnostic | null {
  const reference = decodeReference(context, owner, family, entry.path, metadata, object);
  if (!reference) return recordDiagnostic(entry.path, { kind: "malformed", condition: "The stored path does not name an admitted record" });
  if (!("owner" in reference)) return reference;
  if (context.registry[reference.kind].family !== family) return null;
  if (object?.type !== "blob") return recordDiagnostic(entry.path, {
    kind: "unreadable", condition: "The stored blob is not available locally",
  });
  return decodeRecord(context, reference, object, metadata, entry.path);
}

function capturedMetadata(home: StoredRecordHome, entries: readonly RefTreeEntry[],
  objects: ReadonlyMap<string, BatchObject | null>): RefMetadata | DecodedRecords {
  const entry = entries.find((candidate) => candidate.path === home.metadataPath);
  const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : null, home.ref);
  if (metadata) return metadata;
  const foreign = !entry && entries.find((candidate) => /^metadata-[0-9a-f-]+\.json$/u.test(candidate.path)
    && parseRefMetadata(objects.get(candidate.oid)) !== null);
  if (foreign) return { records: [], diagnostics: entries.filter((candidate) => candidate !== foreign
    && !candidate.path.startsWith(home.manifestPath)).map((candidate) => recordDiagnostic(candidate.path, {
      kind: "key-mismatch", condition: "The metadata filename names a UID other than its ref's owner",
    })) };
  return { records: [], unreadable: true,
    diagnostics: [{ kind: "unreadable", key: home.ref, ...metadataFailure(home.ref) }] };
}

function unreadableRef(ref: string): DecodedRecords {
  return { records: [], unreadable: true, diagnostics: [{ kind: "unreadable", key: ref,
    condition: `The tip or root tree of ${ref} is not available locally`,
    remedy: { text: `Restore the missing objects for ${ref} in the store repository, then retry.` } }] };
}

function selectRecords(records: readonly StoreRecord[], input: ListInput): StoreRecord[] {
  return records.filter((record) => (!input.kind || input.kind === record.reference.kind)
    && (!input.owner || sameOwner(input.owner, record.reference.owner)));
}

function refPrototype(context: RefBackendContext, ref: string, family: FamilyId): RecordReference {
  const root = rootFamily(family);
  const kind = Object.values(context.registry).find((candidate) => candidate.ref && candidate.family === root);
  if (!kind) throw new Error(`No ref home for ${family}`);
  const person = root === "personal" || root === "claims";
  const owner = OwnerIdentitySchema.parse(person ? { type: "person", name: ref.split("/")[3] }
    : root === "work-item" || root === "cohort" ? { type: root, name: "unresolved", uid: ref.split("/").at(-1) }
      : { type: "project", name: "project" });
  return RecordReferenceSchema.parse({ owner, kind: kind.id, ...(kind.key === null ? {} : { key: "unresolved" }) });
}

function missing(reference: RecordReference, condition = "The record is not present in local state",
  remedy = "Pull state or create the record, then retry."): StoreResult<never> {
  return { status: "refused", refusal: { code: "not-found", class: "recoverable", reference,
    condition, remedy: { text: remedy } } };
}
