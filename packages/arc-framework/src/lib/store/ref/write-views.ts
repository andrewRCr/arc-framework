/** Read-only before/after views over captured tips and the complete prepared batch. */

import { corruptRef } from "./namespace-health.js";
import type { StoreView, WriteCheckInput } from "../write-check.js";
import type { RefBackendContext } from "./context.js";
import type { RefWriteGroup } from "./write-commits.js";
import { captureRefPointViewState, captureRefViewState, overlayRefViewState, viewRefFamily, viewRefMetadata, type RefViewState } from "./view-state.js";
import type { ReadInput, StoreRecord, ListInput, ListingOutcome } from "../read.js";
import type { LookupInput, LookupResult } from "../lookup.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { RecordReferenceSchema, sameReference, type RecordReference, type OwnerIdentity } from "../identity.js";
import { decodeCapturedRef, resolveCapturedOwner, refListingRefusal, readableRefListing } from "./read.js";
import { matchesFamilyRef, refOwner, decodeRecord } from "./codec.js";
import { resolveCapturedReference, resolveCapturedListInput, listOwnerReference } from "./reference-resolution.js";
import { claimIdentityRefusal } from "./lookup-claims.js";
import { appendArchivedLookupTrees, type RefLookupCapture } from "./lookup-trees.js";
import { archiveOwnerTrees, isArchiveRef } from "./archive-read.js";
import { lookupCapturedRefTrees, type RefLookupTree } from "./lookup.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import { metadataFailure, type RefMetadata } from "./metadata.js";
import { FAMILY_REGISTRY } from "../registry.js";
import { projectOwnerFromEntries, admitProjectReference, projectListInput, projectListingBinding } from "./project-identity.js";
import { archivedViewRecords } from "./archive-view.js";
import { checkRefKey } from "./path-admission.js";
import { rootFamily } from "./path-decode.js";
import { readCapturedRefHistory } from "./history.js";

/** Build lazy views which never recapture a live ref during a check. */
export function createRefWriteViews(context: RefBackendContext, tips: ReadonlyMap<string, string>,
  groups: ReadonlyMap<string, RefWriteGroup>): { before: WriteCheckInput["before"]; after: StoreView } {
  let prior: Promise<RefViewState> | undefined;
  let next: Promise<RefViewState> | undefined;
  const priorPoints = new Map<string, Promise<RefViewState>>();
  const nextPoints = new Map<string, Promise<RefViewState>>();
  const before = (reference?: RecordReference) => {
    const key = pointViewKey(context, reference);
    if (prior || key === undefined || !reference) return prior ??= captureRefViewState(context, tips);
    let point = priorPoints.get(key);
    if (!point) { point = captureRefPointViewState(context, tips, reference); priorPoints.set(key, point); }
    return point;
  };
  const after = (reference?: RecordReference) => {
    const key = pointViewKey(context, reference);
    if (next || key === undefined) return next ??= before().then((state) => overlayRefViewState(context, state, groups));
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
  if ((owner.type !== "work-item" && owner.type !== "cohort") || !owner.uid
    || context.registry[reference.kind].family !== (owner.type === "work-item" ? "work-item" : "cohort")) return undefined;
  return `${owner.type}:${owner.uid}`;
}

function lookupView(context: RefBackendContext, state: RefViewState, input: LookupInput, identity: string | null = null): StoreResult<LookupResult> {
  const missingIdentity = claimIdentityRefusal(input, identity);
  if (missingIdentity) return { status: "refused", refusal: missingIdentity };
  const trees = lookupViewTrees(context, state, identity);
  return trees.status === "refused" ? trees : lookupCapturedRefTrees(context, input, trees.result.trees, trees.result.unreadable);
}

function lookupViewTrees(context: RefBackendContext, state: RefViewState, identity: string | null = null): StoreResult<RefLookupCapture> {
  const trees = new Map<string, RefLookupTree>();
  const unreadable = new Map<string, StoreRefusal>();
  for (const [ref, group] of state.refs) {
    if (!matchesFamilyRef(ref, "work-item") && !matchesFamilyRef(ref, "cohort") && ref !== "refs/arc/project/registry"
      && !(identity !== null && ref === `refs/arc/user/${identity}/claims`)) continue;
    const family = viewRefFamily(ref);
    const metadata = family ? viewRefMetadata(context, state, ref, family) : null;
    if (group.entries?.length === 0) continue;
    if (!group.entries || !metadata) { unreadable.set(ref, corruptRef(ref, !group.entries)); continue; }
    trees.set(ref, { entries: group.entries, metadata, objects: state.objects });
  }
  const quarters = new Map([...state.refs].flatMap(([ref, group]) => isArchiveRef(ref) && group.entries ? [[ref, group.entries] as const] : []));
  for (const [ref, group] of state.refs) if (isArchiveRef(ref) && !group.entries) unreadable.set(ref, corruptRef(ref, !group.entries));
  appendArchivedLookupTrees(trees, quarters, state.objects, unreadable);
  return { status: "ok", result: { trees, unreadable } };
}

async function listView(context: RefBackendContext, state: RefViewState, input: ListInput): Promise<StoreResult<ListingOutcome>> {
  const unsupported = refListingRefusal(input);
  if (unsupported) return { status: "refused", refusal: unsupported };
  if (FAMILY_REGISTRY[input.family].scope === "identity" && await context.identity() === null) return { status: "ok", result: { status: "absent" } };
  const resolved = resolveViewListInput(context, state, input);
  if (resolved.status === "refused") return resolved;
  input = resolved.result;
  const refs = [...state.refs].filter(([ref]) => matchesFamilyRef(ref, input.family));
  const archived = archivedViewRecords(context, state, input);
  if (refs.length === 0 && !archived.records.length && !archived.diagnostics.length) return { status: "ok", result: { status: "absent" } };
  const project = input.family === "project-registry" || input.family === "project-inbox" ? projectListingBinding(viewProjectOwner(state)) : undefined;
  if (project && !project.diagnostic) {
    const admitted = projectListInput(input, project.owner);
    if (admitted.status === "refused") return admitted;
    input = admitted.result;
  }
  const groups = refs.map(([ref, group]) => decodeCapturedRef(context, input, ref, group.entries, state.objects, group.metadata, project?.owner, group.readPlacement));
  const diagnostics = [...groups.flatMap(({ diagnostics }) => diagnostics), ...archived.diagnostics];
  if (project?.diagnostic && !diagnostics.some(({ key }) => key === project.diagnostic?.key)) diagnostics.push(project.diagnostic);
  if (groups.length > 0 && !archived.records.length && groups.every(({ unreadable }) => unreadable)) return { status: "ok", result: { status: "unreadable",
    condition: diagnostics.map(({ condition }) => condition).join("; "), remedy: { text: diagnostics.map(({ remedy }) => remedy.text).join(" ") } } };
  const records = [...groups.flatMap(({ records }) => records), ...archived.records];
  return { status: "ok", result: readableRefListing(input, records, diagnostics) };
}

function resolveViewListInput(context: RefBackendContext, state: RefViewState, input: ListInput): StoreResult<ListInput> {
  if (!listOwnerReference(input)) return { status: "ok", result: input };
  const trees = lookupViewTrees(context, state);
  return trees.status === "refused" ? trees : resolveCapturedListInput(context, input, trees.result.trees, trees.result.unreadable);
}

async function readView(context: RefBackendContext, state: RefViewState, input: ReadInput): Promise<StoreResult<StoreRecord>> {
  let reference = input.reference;
  const invalid = checkRefKey(reference, context.registry, false);
  if (invalid) return { status: "refused", refusal: invalid };
  const project = viewProjectReference(state, reference);
  if (project.status === "refused") return project;
  reference = project.result;
  if (reference.owner.type === "person" && await context.identity() === null) return missing(reference, "Configure arc.identity before reading person-owned state.");
  const resolved = resolveViewOwner(context, state, reference);
  if (resolved.status === "refused") return resolved;
  reference = resolved.result;
  let home = expandStoredPath(reference, { registry: context.registry });
  const group = state.refs.get(home.ref);
  if (!group) return archivedViewRead(context, state, reference);
  const family = context.registry[reference.kind].family;
  const metadata = viewRefMetadata(context, state, home.ref, family);
  if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: home.ref, ...metadataFailure(home.ref) } };
  if (family !== "lineage" && reference.owner.type !== "project") {
    reference = canonicalViewReference(context, reference, home.ref, metadata);
    home = expandStoredPath(reference, { registry: context.registry });
  }
  const entry = group.entries?.find(({ path }) => path === home.path);
  if (!entry) return missing(reference);
  const object = state.objects.get(entry.oid);
  if (object?.type !== "blob") return { status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", reference, historyRefs: [],
    condition: "The captured record blob is unavailable.", remedy: { text: "Restore or fetch the missing record objects, then retry the write." } } };
  const owner = resolveCapturedOwner(context, reference, home, metadata, object);
  if (owner.status === "refused") return owner;
  reference = RecordReferenceSchema.parse({ ...reference, owner: owner.result });
  const conflicts = viewOpenConflicts(context, state, home, reference);
  const record = decodeRecord(context, reference, object, metadata, home.path, conflicts, group.readPlacement);
  return "reference" in record ? { status: "ok", result: record } : { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
    reference, rule: record.condition, condition: record.condition, remedy: record.remedy } };
}

function needsOwnerLookup(reference: RecordReference): boolean {
  return reference.owner.type !== "person" && reference.owner.type !== "project" && !reference.owner.uid && reference.kind !== "lineage/conflict-record";
}

function missing(reference: RecordReference, condition = "The record is absent from this captured view."): StoreResult<never> {
  return { status: "refused", refusal: { code: "not-found", class: "recoverable", reference, condition,
    remedy: { text: "Create the record or settle the batch's reference, then retry." } } };
}

function viewProjectOwner(state: RefViewState): StoreResult<OwnerIdentity> {
  const registry = state.refs.get("refs/arc/project/registry");
  if (registry && !registry.entries) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
    namespace: "refs/arc/project/registry", condition: "The captured registry tree is unavailable.",
    remedy: { text: "Restore or fetch the registry objects, then retry." } } };
  return projectOwnerFromEntries(registry?.entries ?? [], state.objects);
}

function viewProjectReference(state: RefViewState, reference: RecordReference): StoreResult<RecordReference> {
  if (reference.owner.type !== "project") return { status: "ok", result: reference };
  const owner = viewProjectOwner(state);
  return owner.status === "refused" ? owner : admitProjectReference(reference, owner.result);
}

function viewOpenConflicts(context: RefBackendContext, state: RefViewState, home: StoredRecordHome, reference: RecordReference): RecordReference[] {
  const group = state.refs.get(home.ref);
  if (!group) throw new Error("A checked record has no captured ref group");
  const family = context.registry[reference.kind].family;
  const listed = decodeCapturedRef(context, { family }, home.ref, group.entries, state.objects, group.metadata,
    reference.owner.type === "project" ? reference.owner : undefined, group.readPlacement);
  return listed.records.find((record) => sameReference(record.reference, reference))?.conflicts ?? [];
}

function resolveViewOwner(context: RefBackendContext, state: RefViewState, reference: RecordReference): StoreResult<RecordReference> {
  if (!needsOwnerLookup(reference)) return { status: "ok", result: reference };
  const trees = lookupViewTrees(context, state);
  return trees.status === "refused" ? trees : resolveCapturedReference(context, reference, trees.result.trees, trees.result.unreadable);
}

function canonicalViewReference(context: RefBackendContext, reference: RecordReference, ref: string, metadata: RefMetadata): RecordReference {
  const kind = ["work-item/meta", "work-item/record"].includes(reference.kind) ? metadata.primary?.role ?? reference.kind : reference.kind;
  return RecordReferenceSchema.parse({ ...reference, kind, owner: refOwner(ref, context.registry[reference.kind].family, metadata) });
}

/** A reference with no live ref reads from the quarters; one whose tree is unavailable may hold its folder, or a later one. */
function archivedViewRead(context: RefBackendContext, state: RefViewState, reference: RecordReference): StoreResult<StoreRecord> {
  if (!archivable(context, reference)) return missing(reference);
  const unreadable = [...state.refs].find(([ref, captured]) => isArchiveRef(ref) && !captured.entries)?.[0];
  if (unreadable) return { status: "refused", refusal: corruptRef(unreadable, true) };
  const record = archivedViewRecord(context, state, reference);
  return record ? { status: "ok", result: record } : missing(reference);
}

/** Only a work item or cohort with a UID can have ended into a quarter. */
function archivable(context: RefBackendContext, reference: RecordReference): boolean {
  return reference.owner.type !== "person" && Boolean(reference.owner.uid)
    && ["work-item", "cohort"].includes(rootFamily(context.registry[reference.kind].family));
}

function archivedViewRecord(context: RefBackendContext, state: RefViewState, reference: RecordReference): StoreRecord | undefined {
  const input: ListInput = { family: context.registry[reference.kind].family, owner: reference.owner,
    ...(["work-item/meta", "work-item/record"].includes(reference.kind) ? {} : { kind: reference.kind }) };
  const trees = new Map([...state.refs].flatMap(([ref, group]) => isArchiveRef(ref) && group.entries ? [[ref, group.entries] as const] : []));
  const selected = archiveOwnerTrees(trees, [reference.owner]);
  const refs = new Map(state.refs);
  for (const [ref, group] of state.refs) {
    if (!isArchiveRef(ref)) continue;
    const entries = selected.get(ref);
    if (entries) refs.set(ref, { ...group, entries });
    else refs.delete(ref);
  }
  return archivedViewRecords(context, { ...state, refs }, input).records.find((record) => sameReference(record.reference, reference));
}
