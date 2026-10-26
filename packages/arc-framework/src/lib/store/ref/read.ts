/** Batched live record reads and family listings over captured local state refs. */

import { corruptRef } from "./namespace-health.js";
import { restartOnVanishedStore } from "./repository.js";
import type { ReadPlacement } from "../placement.js";
import { archiveOwnerTrees, isArchiveRef, type ArchivedFolder } from "./archive-read.js";
import { archiveStateFromCapture, captureArchivedFolders, selectEndedOwners } from "./ended-owners.js";
import type { ListInput, ListingOutcome, ListingDiagnostic, ReadInput, StoreRecord } from "../read.js";
import { RecordReferenceSchema, OwnerIdentitySchema, sameOwner, sameReference, type RecordReference, type OwnerIdentity, type StateVersion } from "../identity.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { expandStoredPath, holdsNoRecord, isManifestPath, type StoredRecordHome } from "../stored-path.js";
import type { FamilyId } from "../catalog.js";
import { FAMILY_REGISTRY } from "../registry.js";
import { readBatchObjects, readRefTips, readRefTrees, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { decodeRecord, decodeReference, matchesFamilyRef, refOwner, rootFamily } from "./codec.js";
import { canonicalPrimaryKind, parseRefMetadata, unparsedMetadata, type RefMetadata } from "./metadata.js";
import type { RefBackendContext } from "./context.js";
import { saveCapturedManifest } from "./manifest.js";
import { recordDiagnostic } from "./content-read.js";
import { readOpenConflicts, attachOpenConflicts } from "./conflicts-read.js";
import { checkRefKey } from "./path-admission.js";
import { projectIdentityQueries, projectOwnerFromObjects, admitProjectReference, projectListInput, projectListingBinding, checkProjectIdentity,
  capturedRegistry } from "./project-identity.js";
import { resolveLineageReadReference } from "./lineage-resolution.js";

import { resolveRefName, resolveRefListInput, resolveRefReadName } from "./reference-resolution.js";
import type { RefLookupCapture } from "./lookup-trees.js";
import { readUidRefRecord } from "./read-uid.js";
import { refRecordAbsence } from "./record-absence.js";
import type { RefViewState } from "./view-state.js";

/** Read a record, resolving name-only owners through one captured namespace. */
export async function readRefRecord(context: RefBackendContext, input: ReadInput): Promise<StoreResult<StoreRecord>> {
  const invalidKey = checkRefKey(input.reference, context.registry, false);
  if (invalidKey) return { status: "refused", refusal: invalidKey };
  const personal = input.reference.owner.type === "person" ? await resolveReadReference(context, input.reference) : null;
  if (personal?.status === "refused") return personal;
  return restartOnVanishedStore(context, (bound) => readBoundRecord(bound, input.reference, personal?.result));
}

/** Read an admitted reference from the repository its operation bound. */
async function readBoundRecord(context: RefBackendContext, requested: RecordReference, personal?: RecordReference): Promise<StoreResult<StoreRecord>> {
  let reference = requested;
  const byUid = await readUidRefRecord(context, reference);
  if (byUid) return byUid;
  const tips = await readRefTips(context);
  const resolved = await resolveRefReadName(context, personal ?? reference, tips);
  if (resolved.status === "refused") return resolved;
  reference = resolved.result.reference;
  const home = expandStoredPath(reference, { registry: context.registry });
  const tip = tips.get(home.ref);
  if (!tip && reference.owner.type !== "project") return readArchivedRecord(context, reference, tips, resolved.result.lookup);
  const recordQuery = `${tip}:${home.path}`;
  const metadataQuery = `${tip}:${home.metadataPath}`;
  const conflictsQuery = `${tip}:${home.root}conflicts`;
  const objects = await readBatchObjects(context, [...(tip ? [metadataQuery, recordQuery, conflictsQuery] : []),
    ...(reference.owner.type === "project" ? projectIdentityQueries(tips) : [])]);
  const admitted = projectReadReference(reference, tips, objects);
  if (admitted.status === "refused") return admitted;
  reference = admitted.result;
  if (!tip) return missing(reference);
  const object = objects.get(recordQuery);
  const metadata = parseRefMetadata(objects.get(metadataQuery), home.ref);
  if (!metadata) {
    const entries = (await readRefTrees(context, new Map([[home.ref, tip]]))).get(home.ref);
    // A tree holding no record reads as holding none, as a listing reads it.
    if (entries && holdsNoRecord(home, entries.map(({ path }) => path))) return missing(reference);
    return { status: "refused", refusal: corruptRef(home.ref, !entries) };
  }
  if (object?.type !== "blob") return refRecordAbsence(context, reference, home, tip);
  const owner = resolveCapturedOwner(context, reference, home, metadata, object);
  if (owner.status === "refused") return owner;
  reference = RecordReferenceSchema.parse({ ...reference, owner: owner.result });
  const conflicts = await readOpenConflicts(context, reference, objects.get(conflictsQuery));
  const record = decodeRecord(context, reference, object, metadata, home.path, conflicts);
  return "reference" in record ? { status: "ok", result: record } : { status: "refused", refusal: {
    code: "record-malformed", class: "recoverable", reference, rule: record.condition,
    condition: record.condition, remedy: record.remedy } };
}

/** Resolve a typed reference against captured tips before choosing its stored address. */
export async function resolveReadReference(context: RefBackendContext, reference: RecordReference, tips?: ReadonlyMap<string, string>): Promise<StoreResult<RecordReference>> {
  if (reference.owner.type === "person") {
    const identity = await context.identity();
    if (identity === null) return { status: "refused", refusal: { code: "not-found", class: "recoverable", reference,
      condition: "No arc.identity is configured for person-owned state",
      remedy: { text: "Configure arc.identity, then retry.", argv: ["git", "config", "arc.identity", reference.owner.name] } } };
    const other = otherIdentityRefusal(reference, identity);
    if (other) return { status: "refused", refusal: other };
  }
  if (context.registry[reference.kind].family === "lineage") return resolveLineageReadReference(context, reference, tips);
  if (reference.owner.type === "work-item" || reference.owner.type === "cohort") {
    return resolveRefName(context, reference, tips ?? await readRefTips(context));
  }

  return { status: "ok", result: reference };
}

/** The identity an identity-scoped family lists under: undefined where none is configured, and null for any other family. */
export async function listingIdentity(context: RefBackendContext, family: FamilyId): Promise<string | null | undefined> {
  return FAMILY_REGISTRY[family].scope === "identity" ? await context.identity() ?? undefined : null;
}

/** Another person's identity ref, which every read treats as absent, as a saved read does; a listing naming another person reads none. */
export function otherIdentityRef(ref: string, identity: string | null, owner?: ListInput["owner"]): boolean {
  return ref.startsWith("refs/arc/user/") && (ref.split("/")[3] !== identity || owner?.type === "person" && owner.name !== identity);
}

/** Refuse a person-owned reference outside the configured identity as an absent record. */
function otherIdentityRefusal(reference: RecordReference, identity: string): StoreRefusal | undefined {
  if (reference.owner.type !== "person" || reference.owner.name === identity) return undefined;
  return { code: "not-found", class: "recoverable", reference,
    condition: `The requested personal identity ${reference.owner.name} is not the configured identity ${identity}.`,
    remedy: { text: `Select ${identity}'s personal record or configure arc.identity as ${reference.owner.name}, then retry.` } };
}

/** Decode and validate the requested owner against captured metadata and content. */
export function resolveCapturedOwner(context: RefBackendContext, reference: RecordReference, home: StoredRecordHome,
  metadata: RefMetadata, object: BatchObject): StoreResult<OwnerIdentity> {
  const family = context.registry[reference.kind].family;
  if (reference.owner.type === "project") return { status: "ok", result: reference.owner };
  if (family !== "lineage") return { status: "ok", result: refOwner(home.ref, family, metadata) };
  const decoded = decodeReference(context, reference.owner, family, home.path, metadata, object);
  if (!decoded || !("owner" in decoded)) return { status: "refused", refusal: {
    code: "record-malformed", class: "recoverable", reference, rule: "store.lineage-owner",
    condition: "The lineage record's owner cannot be decoded from its registry metadata or conflict target.",
    remedy: { text: `Repair the stored entry at ${home.path} and its owner metadata, then retry.` },
  } };
  const requested = reference.owner;
  const matches = requested.type !== "person" && requested.uid !== undefined ? sameOwner(requested, decoded.owner)
    : requested.type === decoded.owner.type && requested.name === decoded.owner.name;
  return matches ? { status: "ok", result: decoded.owner } : missing(reference);
}

/** List a registered family from one tip capture, tree check, recursive diff, and blob batch. */
export async function listRefRecords(context: RefBackendContext, input: ListInput): Promise<StoreResult<ListingOutcome>> {
  const unsupported = refListingRefusal(input);
  if (unsupported) return { status: "refused", refusal: unsupported };
  return restartOnVanishedStore(context, (bound) => listBoundRecords(bound, input));
}

/** List an admitted family from the repository its operation bound. */
async function listBoundRecords(context: RefBackendContext, input: ListInput): Promise<StoreResult<ListingOutcome>> {
  const identity = await listingIdentity(context, input.family);
  const captured = await readRefTips(context);
  const resolved = await resolveRefListInput(context, input, captured);
  if (resolved.status === "refused") return resolved;
  input = resolved.result;
  const asOf = await saveCapturedManifest(context, captured);
  if (identity === undefined) return { status: "ok", result: { status: "absent", asOf } };
  const tips = new Map([...captured].filter(([ref]) => matchesFamilyRef(ref, input.family) && !otherIdentityRef(ref, identity, input.owner)
    || ["work-item", "cohort"].includes(rootFamily(input.family)) && isArchiveRef(ref)));
  if (tips.size === 0) return { status: "ok", result: { status: "absent", asOf } };
  const trees = await readRefTrees(context, tips);
  const projectFamily = input.family === "project-inbox" || input.family === "project-registry";
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map((entry) => entry.oid))),
    ...(projectFamily ? projectIdentityQueries(captured) : [])]);
  const project = projectFamily ? projectListingBinding(capturedRegistry(captured, objects), objects) : undefined;
  if (project && !project.diagnostic) {
    const admitted = projectListInput(input, project.owner);
    if (admitted.status === "refused") return admitted;
    input = admitted.result;
  }
  const groups = [...tips.keys()].filter(ref => !isArchiveRef(ref)).map((ref) => {
    const entries = trees.get(ref);
    return decodeCapturedRef(context, input, ref, entries, objects, undefined, project?.owner);
  });
  if ([...tips.keys()].some(isArchiveRef)) groups.push(decodeArchivedListing(context, input, archiveStateFromCapture(captured, trees, objects)));
  const records = groups.flatMap((group) => group.records);
  const diagnostics = groups.flatMap((group) => group.diagnostics);
  if (project?.diagnostic && !diagnostics.some(({ key }) => key === project.diagnostic?.key)) diagnostics.push(project.diagnostic);
  if (groups.length > 0 && groups.every((group) => group.unreadable)) return { status: "ok", result: { status: "unreadable",
    condition: diagnostics.map((diagnostic) => diagnostic.condition).join("; "),
    remedy: { text: diagnostics.map((diagnostic) => diagnostic.remedy.text).join(" ") } } };
  return { status: "ok", result: readableRefListing(input, records, diagnostics, asOf) };
}

function decodeArchivedListing(context: RefBackendContext, input: ListInput, state: RefViewState): DecodedRecords {
  const ended = selectEndedOwners(state, captureArchivedFolders(state, input.family));
  const decoded = ended.folders.map(folder => {
    const group = decodeCapturedRef(context, input, folder.liveRef, folder.entries, state.objects, folder.metadata, undefined, folder.placement);
    return { records: group.records, diagnostics: group.diagnostics.map(diagnostic => ({ ...diagnostic, key: folder.root + diagnostic.key })) };
  });
  return { records: decoded.flatMap(group => group.records), diagnostics: [...ended.diagnostics, ...decoded.flatMap(group => group.diagnostics)],
    ...[...state.refs].filter(([ref]) => isArchiveRef(ref)).every(([, group]) => !group.entries) ? { unreadable: true as const } : {} };
}

/** Preserve kind-scoped absence and lifecycle filtering in current, saved, and checked listings. */
export function readableRefListing(input: ListInput, records: StoreRecord[], diagnostics: ListingDiagnostic[], asOf?: StateVersion): ListingOutcome {
  const anchor = asOf === undefined ? {} : { asOf };
  if (input.kind !== undefined && records.length === 0 && diagnostics.length === 0) return { status: "absent", ...anchor };
  return { status: "complete", records: filterListingLocations(records, input), diagnostics, missed: diagnostics.length > 0, ...anchor };
}

/** Filter lifecycle locations after determining whether the requested kind and owner exist. */
function filterListingLocations(records: StoreRecord[], input: ListInput): StoreRecord[] {
  const locations = input.filter?.locations;
  if (!locations) return records;
  return records.filter(({ placement }) => placement !== undefined
    && locations.includes(placement.kind === "backlog" ? placement.commitment : placement.kind));
}

interface DecodedRecords { records: StoreRecord[]; diagnostics: ListingDiagnostic[]; unreadable?: true }

/** Decode one ref without observing live tips, with optional prepared metadata. */
export function decodeCapturedRef(context: RefBackendContext, input: ListInput, ref: string,
  entries: readonly RefTreeEntry[] | undefined, objects: ReadonlyMap<string, BatchObject | null>, metadataOverride?: RefMetadata, projectOwner?: OwnerIdentity,
  placement?: ReadPlacement, saved = false): DecodedRecords {
  if (!entries) return unreadableRef(ref);
  const records: StoreRecord[] = [];
  const diagnostics: ListingDiagnostic[] = [];
  const prototype = refPrototype(context, ref, input.family);
  const home = expandStoredPath(prototype, { registry: context.registry });
  if (holdsNoRecord(home, entries.map(({ path }) => path))) return { records, diagnostics };
  const metadata = metadataOverride ?? capturedMetadata(home, entries, objects, saved);
  if (!("formats" in metadata)) return metadata;
  const owner = projectOwner ?? refOwner(ref, input.family, metadata);
  for (const entry of entries) {
    if (entry.path === home.metadataPath || isManifestPath(home, entry.path)) continue;
    const record = decodeCapturedEntry(context, input.family, owner, entry, objects.get(entry.oid), metadata, placement);
    if (!record) continue;
    if ("reference" in record) records.push(record); else diagnostics.push(record);
  }
  return { records: selectRecords(attachOpenConflicts(records), input), diagnostics };
}

function decodeCapturedEntry(context: RefBackendContext, family: FamilyId, owner: OwnerIdentity, entry: RefTreeEntry,
  object: BatchObject | null | undefined, metadata: RefMetadata, placement?: ReadPlacement): StoreRecord | ListingDiagnostic | null {
  if (entry.invalidName) return recordDiagnostic(entry.path, { kind: "malformed", condition: "The stored path is not valid UTF-8" });
  const reference = decodeReference(context, owner, family, entry.path, metadata, object);
  if (!reference) return recordDiagnostic(entry.path, object?.type === "blob"
    ? { kind: "malformed", condition: "The stored path does not name an admitted record" }
    : { kind: "unreadable", condition: "The stored blob is not available locally" });
  if (!("owner" in reference)) return reference;
  if (context.registry[reference.kind].family !== family) return null;
  if (object?.type !== "blob") return recordDiagnostic(entry.path, {
    kind: "unreadable", condition: "The stored blob is not available locally",
  });
  const record = decodeRecord(context, reference, object, metadata, entry.path, [], placement);
  if ("reference" in record) {
    const invalid = checkProjectIdentity(reference, new TextDecoder().decode(object.bytes));
    if (invalid) return recordDiagnostic(entry.path, { kind: "malformed", condition: invalid.condition });
  }
  return record;
}

function capturedMetadata(home: StoredRecordHome, entries: readonly RefTreeEntry[],
  objects: ReadonlyMap<string, BatchObject | null>, saved: boolean): RefMetadata | DecodedRecords {
  const entry = entries.find((candidate) => candidate.path === home.metadataPath);
  const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : null, home.ref);
  if (metadata) return metadata;
  const foreign = !entry && entries.find((candidate) => /^metadata-[0-9a-f-]+\.json$/u.test(candidate.path)
    && parseRefMetadata(objects.get(candidate.oid)) !== null);
  if (foreign) return { records: [], diagnostics: entries.filter((candidate) => candidate !== foreign
    && !isManifestPath(home, candidate.path)).map((candidate) => recordDiagnostic(candidate.path, {
      kind: "key-mismatch", condition: "The metadata filename names a UID other than its ref's owner",
    })) };
  return { records: [], unreadable: true,
    diagnostics: [{ kind: "unreadable", key: home.ref, ...unparsedMetadata(home.ref, saved) }] };
}

function unreadableRef(ref: string): DecodedRecords {
  return { records: [], unreadable: true, diagnostics: [{ kind: "unreadable", key: ref,
    condition: `The tip or a tree of ${ref} is not available locally`,
    remedy: { text: `Restore the missing objects for ${ref} in the store repository, then retry.` } }] };
}

function selectRecords(records: readonly StoreRecord[], input: ListInput): StoreRecord[] {
  return records.filter((record) => (!input.kind || input.kind === record.reference.kind)
    && (!input.owner || sameOwner(input.owner, record.reference.owner)));
}

/** Construct a reference shell for resolving a captured ref's auxiliary paths. */
export function refPrototype(context: RefBackendContext, ref: string, family: FamilyId): RecordReference {
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

function projectReadReference(reference: RecordReference, tips: ReadonlyMap<string, string>,
  objects: ReadonlyMap<string, BatchObject | null>): StoreResult<RecordReference> {
  if (reference.owner.type !== "project") return { status: "ok", result: reference };
  const owner = projectOwnerFromObjects(tips, objects);
  return owner.status === "refused" ? owner : admitProjectReference(reference, owner.result);
}

async function readArchivedRecord(context: RefBackendContext, reference: RecordReference, tips: ReadonlyMap<string, string>,
  lookup?: RefLookupCapture): Promise<StoreResult<StoreRecord>> {
  const family = context.registry[reference.kind].family;
  if (reference.owner.type === "person" || !reference.owner.uid || !["work-item", "cohort"].includes(rootFamily(family))) return missing(reference);
  const selected = new Map([...tips].filter(([ref]) => isArchiveRef(ref)));
  if (!selected.size) return missing(reference);
  const located = [...lookup?.trees.values() ?? []].find(tree => tree.liveRef === expandStoredPath(reference, { registry: context.registry }).ref)?.archived;
  const quarters = located ? undefined : await readRefTrees(context, selected);
  // A quarter whose tree cannot be read may hold the owner's folder, or a later one, so no folder found settles the read.
  const unreadable = quarters && [...selected.keys()].find((ref) => !quarters.has(ref));
  if (unreadable) return { status: "refused", refusal: corruptRef(unreadable, true) };
  const trees = located ? new Map([[located.ref, located.entries.map(entry => ({ ...entry, path: located.root + entry.path }))]])
    : archiveOwnerTrees(quarters ?? new Map(), [reference.owner]);
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid)))]);
  const state = archiveStateFromCapture(tips, new Map([...selected.keys()].map(ref => [ref, trees.get(ref) ?? []])), objects);
  const ended = selectEndedOwners(state, captureArchivedFolders(state, family, [reference.owner]));
  const diagnostic = ended.diagnostics[0];
  if (diagnostic) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: diagnostic.key.split(":")[0] ?? diagnostic.key,
    condition: diagnostic.condition, remedy: diagnostic.remedy } };
  const folder = ended.folders.find(({ owner }) => sameOwner(owner, reference.owner));
  if (!folder) return missing(reference);
  return readArchivedFolder(context, folder, reference, objects);
}

/** Read one archived record while retaining its own decoding or unavailable-object refusal. */
export function readArchivedFolder(context: RefBackendContext, folder: ArchivedFolder, reference: RecordReference,
  objects: ReadonlyMap<string, BatchObject | null>, saved = false): StoreResult<StoreRecord> {
  const family = context.registry[reference.kind].family;
  reference = RecordReferenceSchema.parse({ ...reference, kind: canonicalPrimaryKind(reference.kind, folder.metadata), owner: folder.owner });
  // The owner is resolved only now, so its companion aliases are checked under the folder's slug, as a live read checks them.
  const invalidKey = checkRefKey(reference, context.registry);
  if (invalidKey) return { status: "refused", refusal: invalidKey };
  const decoded = decodeCapturedRef(context, { family, kind: reference.kind, owner: reference.owner }, folder.liveRef,
    folder.entries, objects, folder.metadata, undefined, folder.placement, saved);
  const record = decoded.records.find(record => sameReference(record.reference, reference));
  if (record) return { status: "ok", result: record };
  const path = expandStoredPath(reference, { registry: context.registry }).path;
  const diagnostic = decoded.diagnostics.find(entry => entry.key === path);
  if (diagnostic?.kind === "unreadable") return { status: "refused", refusal: { code: "state-unresolvable", class: "recoverable",
    reference, historyRefs: [], condition: diagnostic.condition, remedy: { text: saved
      ? "Restore or fetch the missing record objects, then retry this saved-state read."
      : "Restore or fetch the missing record objects, then retry the read." } } };
  if (diagnostic) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference,
    rule: diagnostic.condition, condition: diagnostic.condition, remedy: diagnostic.remedy } };
  return saved ? missing(reference, "The record is absent from this saved state.",
    "Select a saved state containing this record, or use the current store state, then retry the saved-state read.") : missing(reference);
}

/** Ref-backed state cannot infer checkout ownership from stored record placement. */
export function refListingRefusal(input: ListInput): StoreRefusal | null {
  return input.filter?.heldHere ? { code: "unsupported", class: "recoverable", case: "held-here",
    condition: "Stored state does not identify which item this checkout holds.",
    remedy: { text: "Use lookup with this checkout's claim, or list without heldHere." },
  } : null;
}
