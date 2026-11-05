/** Read-only before/after views over captured tips and the complete prepared batch. */

import { corruptRef } from "./namespace-health.js";
import type { StoreView, WriteCheckInput } from "../write-check.js";
import type { RefBackendContext } from "./context.js";
import type { RefWriteGroup } from "./write-commits.js";
import { captureRefPointViewState, captureRefViewState, overlayRefViewState, viewRefFamily, viewRefMetadata, type RefViewState, type RefViewGroup } from "./view-state.js";
import type { ListingDiagnostic, ReadInput, StoreRecord, ListInput, ListingOutcome } from "../read.js";
import type { LookupInput, LookupResult } from "../lookup.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { RecordReferenceSchema, sameOwner, sameReference, type RecordReference, type OwnerIdentity } from "../identity.js";
import { decodeCapturedRef, resolveCapturedOwner, refListingRefusal, readableRefListing, resolveReadReference, otherIdentityRef, listingIdentity, readArchivedFolder, refPrototype } from "./read.js";
import { matchesFamilyRef, refOwner, decodeRecord } from "./codec.js";
import { resolveCapturedReference, resolveCapturedListInput, listOwnerReference } from "./reference-resolution.js";
import { claimIdentityRefusal } from "./lookup-claims.js";
import { appendArchivedLookupTrees, type RefLookupCapture } from "./lookup-trees.js";
import { isArchiveRef } from "./archive-read.js";
import { lookupCapturedRefTrees, type RefLookupTree } from "./lookup.js";
import { expandStoredPath, holdsNoRecord, type StoredRecordHome } from "../stored-path.js";
import { canonicalPrimaryKind, type RefMetadata, type RefMetadataRead } from "./metadata.js";
import { projectOwnerFromEntries, admitProjectReference, projectListInput, projectListingBinding, registryTreeUnavailable,
  type CapturedRegistry } from "./project-identity.js";
import { archivedViewRecords } from "./archive-view.js";
import { checkRefKey } from "./path-admission.js";
import { rootFamily } from "./path-decode.js";
import { readCapturedRefHistory } from "./history.js";
import { captureArchivedFolders, selectEndedOwners } from "./ended-owners.js";
import { refObjectFault, refDiagnosticRefusal, type RefFaultOptions } from "./object-fault.js";
import type { RefCaptureFault } from "./capture-diagnostic.js";
import { missingHistoryRefs } from "./missing-history.js";
import { listingRefMatches } from "./listing-scope.js";

/** Build lazy views which never recapture a live ref during a check. */
export function createRefWriteViews(context: RefBackendContext, tips: ReadonlyMap<string, string>,
  groups: ReadonlyMap<string, RefWriteGroup>): { before: WriteCheckInput["before"]; after: StoreView } {
  let prior: Promise<RefViewState> | undefined;
  let next: Promise<RefViewState> | undefined;
  const priorPoints = new Map<string, Promise<RefViewState>>();
  const nextPoints = new Map<string, Promise<RefViewState>>();
  const before = (reference?: RecordReference) => {
    const key = pointViewKey(context, reference);
    if (key === undefined || !reference) return prior ??= captureRefViewState(context, tips);
    let point = priorPoints.get(key);
    if (!point) { point = captureRefPointViewState(context, tips, reference); priorPoints.set(key, point); }
    return point;
  };
  const after = (reference?: RecordReference) => {
    const key = pointViewKey(context, reference);
    if (key === undefined) return next ??= before().then((state) => overlayRefViewState(context, state, groups));
    let point = nextPoints.get(key);
    if (!point) { point = before(reference).then((state) => overlayRefViewState(context, state, groups)); nextPoints.set(key, point); }
    return point;
  };
  return { before: { ...capturedRefView(context, before),
    history: input => readCapturedRefHistory(context, input.reference, tips) }, after: capturedRefView(context, after) };
}

/** Read only immutable captured trees, using the same selection in checks and saved-state reads. */
export function capturedRefView(context: RefBackendContext, load: (reference?: RecordReference) => Promise<RefViewState>): StoreView {
  return {
    read: async (input) => readView(context, await load(input.reference), input),
    list: async (input) => listView(context, await load(), input),
    lookup: async (input) => lookupView(context, await load(), input, await context.identity()),
  };
}

function pointViewKey(context: RefBackendContext, reference?: RecordReference): string | undefined {
  if (!context.writeEvidence || !reference) return undefined;
  const owner = reference.owner;
  if (owner.type !== "person" && owner.type !== "project" && !owner.uid) return undefined;
  // A scoped fallback contains only this subject and its siblings, so another subject needs its own cache entry.
  return JSON.stringify(reference);
}

async function lookupView(context: RefBackendContext, state: RefViewState, input: LookupInput, identity: string | null = null): Promise<StoreResult<LookupResult>> {
  const missingIdentity = claimIdentityRefusal(input, identity);
  if (missingIdentity) return { status: "refused", refusal: missingIdentity };
  const trees = await lookupViewTrees(context, state, identity);
  return trees.status === "refused" ? trees : lookupCapturedRefTrees(context, input, trees.result.trees, trees.result.unreadable);
}

async function lookupViewTrees(context: RefBackendContext, state: RefViewState, identity: string | null = null): Promise<StoreResult<RefLookupCapture>> {
  const trees = new Map<string, RefLookupTree>();
  const unreadable = new Map<string, StoreRefusal>();
  for (const [ref, group] of state.refs) {
    if (!matchesFamilyRef(ref, "work-item") && !matchesFamilyRef(ref, "cohort") && ref !== "refs/arc/project/registry"
      && !(identity !== null && ref === `refs/arc/user/${identity}/claims`)) continue;
    const decoded = await lookupViewTree(context, state, ref, group);
    if (!decoded) continue;
    if ("code" in decoded) unreadable.set(ref, decoded); else trees.set(ref, decoded);
  }
  appendArchivedLookupTrees(trees, state, unreadable);
  return { status: "ok", result: { trees, unreadable } };
}

async function lookupViewTree(context: RefBackendContext, state: RefViewState, ref: string, group: RefViewGroup): Promise<RefLookupTree | StoreRefusal | undefined> {
  const family = viewRefFamily(ref);
  if (family && group.entries && holdsNoRecord(expandStoredPath(refPrototype(context, ref, family),
    { registry: context.registry }), group.entries.map(({ path }) => path))) return;
  if (!group.entries) return viewObjectFault(context, ref, "missing", { condition: `The tip or a tree of ${ref} is unavailable locally.` });
  if (!family) return corruptRef(ref, { saved: state.saved });
  const read = viewRefMetadata(context, state, ref, family);
  if (read.kind !== "parsed") return viewObjectFault(context, ref, read.kind === "absent" ? "no-metadata" : read.kind, { saved: state.saved });
  return { entries: group.entries, metadata: read.metadata, objects: state.objects };
}

async function listView(context: RefBackendContext, state: RefViewState, input: ListInput): Promise<StoreResult<ListingOutcome>> {
  const unsupported = refListingRefusal(input);
  if (unsupported) return { status: "refused", refusal: unsupported };
  const identity = await listingIdentity(context, input.family);
  if (identity === undefined) return { status: "ok", result: { status: "absent" } };
  const resolved = await resolveViewListInput(context, state, input);
  if (resolved.status === "refused") return resolved;
  input = resolved.result;
  const refs = [...state.refs].filter(([ref]) => matchesFamilyRef(ref, input.family) && !otherIdentityRef(ref, identity, input.owner)
    && listingRefMatches(ref, input, state.refs));
  const archived = archivedViewRecords(context, state, input);
  if (refs.length === 0 && !archived.records.length && !archived.diagnostics.length) return { status: "ok", result: { status: "absent" } };
  const project = input.family === "project-registry" || input.family === "project-inbox" ? projectListingBinding(viewRegistry(state), state.objects, state.saved) : undefined;
  if (project && !project.diagnostic) {
    const admitted = projectListInput(input, project.owner);
    if (admitted.status === "refused") return admitted;
    input = admitted.result;
  }
  const groups = refs.map(([ref, group]) => decodeCapturedRef(context, input, ref, group.entries, state.objects, group.metadata, project?.owner,
    group.readPlacement, { saved: state.saved }));
  const diagnostics = [...groups.flatMap(({ diagnostics }) => diagnostics), ...archived.diagnostics];
  mergeProjectDiagnostic(diagnostics, project?.diagnostic, state.saved);
  if (groups.length > 0 && !archived.records.length && groups.every(({ unreadable }) => unreadable)) return { status: "ok", result: { status: "unreadable",
    condition: diagnostics.map(({ condition }) => condition).join("; "), remedy: { text: diagnostics.map(({ remedy }) => remedy.text).join(" ") } } };
  const records = [...groups.flatMap(({ records }) => records), ...archived.records];
  return { status: "ok", result: readableRefListing(input, records, diagnostics) };
}

function mergeProjectDiagnostic(diagnostics: ListingDiagnostic[], project: ListingDiagnostic | undefined, saved = false): void {
  if (!project) return;
  const matching = diagnostics.findIndex(({ key }) => key === project.key);
  if (matching === -1) diagnostics.push(project);
  else if (saved) diagnostics[matching] = project;
}

async function resolveViewListInput(context: RefBackendContext, state: RefViewState, input: ListInput): Promise<StoreResult<ListInput>> {
  if (!listOwnerReference(input)) return { status: "ok", result: input };
  const trees = await lookupViewTrees(context, state);
  return trees.status === "refused" ? trees : resolveCapturedListInput(context, input, trees.result.trees, trees.result.unreadable);
}

async function readView(context: RefBackendContext, state: RefViewState, input: ReadInput): Promise<StoreResult<StoreRecord>> {
  let reference = input.reference;
  const invalid = checkRefKey(reference, context.registry, false);
  if (invalid) return { status: "refused", refusal: invalid };
  const project = viewProjectReference(state, reference);
  if (project.status === "refused") return project;
  reference = project.result;
  const personal = reference.owner.type === "person" ? await resolveReadReference(context, reference) : null;
  if (personal?.status === "refused") return personal;
  const resolved = await resolveViewOwner(context, state, reference);
  if (resolved.status === "refused") return resolved;
  reference = resolved.result;
  let home = expandStoredPath(reference, { registry: context.registry });
  const group = state.refs.get(home.ref);
  if (!group) return archivedViewRead(context, state, reference);
  const family = context.registry[reference.kind].family;
  const read = viewRefMetadata(context, state, home.ref, family);
  if (read.kind !== "parsed") return missingViewMetadata(context, state, reference, home, read);
  const metadata = read.metadata;
  if (family !== "lineage" && reference.owner.type !== "project") {
    reference = canonicalViewReference(context, reference, home.ref, metadata);
    home = expandStoredPath(reference, { registry: context.registry });
  }
  const resolvedKeyProblem = checkRefKey(reference, context.registry);
  if (resolvedKeyProblem) return { status: "refused", refusal: resolvedKeyProblem };
  return readViewRecord(context, state, reference, home, metadata, group);
}

async function readViewRecord(context: RefBackendContext, state: RefViewState, reference: RecordReference, home: StoredRecordHome,
  metadata: RefMetadata, group: RefViewGroup): Promise<StoreResult<StoreRecord>> {
  const entry = group.entries?.find(({ path }) => path === home.path);
  if (!entry) return missing(reference, state.saved);
  const object = state.objects.get(entry.oid);
  if (object?.type !== "blob") return { status: "refused", refusal: await viewObjectFault(context, home.ref, "missing", { reference,
    condition: "The captured record blob is unavailable.", remedy: { text: state.saved
      ? "Restore or fetch the missing record objects, then retry this saved-state read."
      : "Restore or fetch the missing record objects, then retry the write." },
  }) };
  const owner = resolveCapturedOwner(context, reference, home, metadata, object, state.saved);
  if (owner.status === "refused") return owner;
  reference = RecordReferenceSchema.parse({ ...reference, owner: owner.result });
  const conflicts = await viewOpenConflicts(context, state, home, reference);
  if (conflicts.status === "refused") return conflicts;
  const record = decodeRecord(context, reference, object, metadata, home.path, conflicts.result, group.readPlacement, { saved: state.saved, pointRead: true });
  return "reference" in record ? { status: "ok", result: record } : { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
    reference, rule: record.condition, condition: record.condition, remedy: record.remedy } };
}

function needsOwnerLookup(reference: RecordReference): boolean {
  return reference.owner.type !== "person" && reference.owner.type !== "project" && !reference.owner.uid && reference.kind !== "lineage/conflict-record";
}

async function missingViewMetadata(context: RefBackendContext, state: RefViewState, reference: RecordReference, home: StoredRecordHome,
  read: Exclude<RefMetadataRead, { kind: "parsed" }>): Promise<StoreResult<never>> {
  const entries = state.refs.get(home.ref)?.entries;
  if (!entries) return { status: "refused", refusal: await viewObjectFault(context, home.ref, "missing", {
    reference, condition: `The tip or a tree of ${home.ref} is unavailable locally.`,
  }) };
  if (read.kind === "missing") return { status: "refused", refusal: await viewObjectFault(context, home.ref, "missing", { reference }) };
  if (holdsNoRecord(home, entries.map(({ path }) => path))) return missing(reference, state.saved);
  return { status: "refused", refusal: refObjectFault(home.ref, read.kind === "absent" ? "no-metadata" : "unparseable", { saved: state.saved }).refusal };
}

function missing(reference: RecordReference, saved = false): StoreResult<never> {
  return { status: "refused", refusal: { code: "not-found", class: "recoverable", reference,
    condition: saved ? "The record is absent from this saved state." : "The record is absent from this captured view.",
    remedy: { text: saved ? "Select a saved state containing this record, or use the current store state, then retry the saved-state read."
      : "Create the record or settle the batch's reference, then retry." } } };
}

function viewProjectOwner(state: RefViewState): StoreResult<OwnerIdentity> {
  const { entries } = viewRegistry(state);
  return entries ? projectOwnerFromEntries(entries, state.objects, undefined, state.saved) : { status: "refused", refusal: registryTreeUnavailable() };
}

function viewRegistry(state: RefViewState): CapturedRegistry {
  const registry = state.refs.get("refs/arc/project/registry");
  return { entries: registry ? registry.entries ?? null : [] };
}

function viewProjectReference(state: RefViewState, reference: RecordReference): StoreResult<RecordReference> {
  if (reference.owner.type !== "project") return { status: "ok", result: reference };
  const owner = viewProjectOwner(state);
  return owner.status === "refused" ? owner : admitProjectReference(reference, owner.result);
}

async function viewOpenConflicts(context: RefBackendContext, state: RefViewState, home: StoredRecordHome, reference: RecordReference): Promise<StoreResult<RecordReference[]>> {
  const group = state.refs.get(home.ref);
  if (!group) throw new Error("A checked record has no captured ref group");
  const family = context.registry[reference.kind].family;
  const listed = decodeCapturedRef(context, { family }, home.ref, group.entries, state.objects, group.metadata,
    reference.owner.type === "project" ? reference.owner : undefined, group.readPlacement, { saved: state.saved, pointRead: true });
  const refusal = listed.conflictRefusals?.get(home.path);
  const diagnostic = listed.diagnostics.find(({ key }) => key === home.path);
  if (refusal) return { status: "refused", refusal: diagnostic?.fault === "missing" && refusal.code === "state-unresolvable"
    ? { ...refusal, historyRefs: await missingHistoryRefs(context, [home.ref]) } : refusal };
  const record = listed.records.find((record) => sameReference(record.reference, reference));
  if (record) return { status: "ok", result: record.conflicts };
  return diagnostic ? { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference,
    rule: diagnostic.condition, condition: diagnostic.condition, remedy: diagnostic.remedy } } : missing(reference, state.saved);
}

async function resolveViewOwner(context: RefBackendContext, state: RefViewState, reference: RecordReference): Promise<StoreResult<RecordReference>> {
  if (!needsOwnerLookup(reference)) return { status: "ok", result: reference };
  const trees = await lookupViewTrees(context, state);
  return trees.status === "refused" ? trees : resolveCapturedReference(context, reference, trees.result.trees, trees.result.unreadable);
}

async function viewObjectFault(context: RefBackendContext, ref: string, fault: RefCaptureFault,
  options: RefFaultOptions = {}): Promise<StoreRefusal> {
  return refObjectFault(ref, fault, { ...options,
    ...fault === "missing" ? { historyRefs: await missingHistoryRefs(context, [ref]) } : {},
  }).refusal;
}

function canonicalViewReference(context: RefBackendContext, reference: RecordReference, ref: string, metadata: RefMetadata): RecordReference {
  const kind = canonicalPrimaryKind(reference.kind, metadata);
  return RecordReferenceSchema.parse({ ...reference, kind, owner: refOwner(ref, context.registry[reference.kind].family, metadata) });
}

/** A reference with no live ref reads from the quarters; one whose tree is unavailable may hold its folder, or a later one. */
function archivedViewRead(context: RefBackendContext, state: RefViewState, reference: RecordReference): StoreResult<StoreRecord> {
  if (!archivable(context, reference)) return missing(reference, state.saved);
  const unreadable = [...state.refs].find(([ref, captured]) => isArchiveRef(ref) && !captured.entries)?.[0];
  if (unreadable) return { status: "refused", refusal: refObjectFault(unreadable, "missing", {
    condition: `The tip or a tree of ${unreadable} is unavailable locally.`,
  }).refusal };
  const ended = selectEndedOwners(state, captureArchivedFolders(state, context.registry[reference.kind].family, [reference.owner]));
  const diagnostic = ended.diagnostics[0];
  if (diagnostic) return { status: "refused", refusal: refDiagnosticRefusal(diagnostic.key.split(":")[0] ?? diagnostic.key, diagnostic) };
  const folder = ended.folders.find(({ owner }) => sameOwner(owner, reference.owner));
  return folder ? readArchivedFolder(context, folder, reference, state.objects, state.saved) : missing(reference, state.saved);
}

/** Only a work item or cohort with a UID can have ended into a quarter. */
function archivable(context: RefBackendContext, reference: RecordReference): boolean {
  return reference.owner.type !== "person" && Boolean(reference.owner.uid)
    && ["work-item", "cohort"].includes(rootFamily(context.registry[reference.kind].family));
}
