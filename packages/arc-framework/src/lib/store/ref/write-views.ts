/** Read-only before/after views over captured tips and the complete prepared batch. */

import type { StoreView } from "../write-check.js";
import type { RefBackendContext } from "./context.js";
import type { RefWriteGroup } from "./write-commits.js";
import { captureRefViewState, overlayRefViewState, viewRefFamily, viewRefMetadata, type RefViewState } from "./view-state.js";
import type { ReadInput, StoreRecord, ListInput, ListingOutcome } from "../read.js";
import type { LookupInput, LookupResult } from "../lookup.js";
import type { StoreResult } from "../refusal.js";
import { RecordReferenceSchema, sameReference, type RecordReference } from "../identity.js";
import { decodeCapturedRef, resolveCapturedOwner } from "./read.js";
import { matchesFamilyRef, refOwner, decodeRecord } from "./codec.js";
import { lookupCapturedRefTrees, type RefLookupTree } from "./lookup.js";
import { expandStoredPath } from "../stored-path.js";
import { metadataFailure } from "./metadata.js";
import { FAMILY_REGISTRY } from "../registry.js";
import { checkRefKey } from "./path-admission.js";

/** Build lazy views which never recapture a live ref during a check. */
export function createRefWriteViews(context: RefBackendContext, tips: ReadonlyMap<string, string>,
  groups: ReadonlyMap<string, RefWriteGroup>): { before: StoreView; after: StoreView } {
  let prior: Promise<RefViewState> | undefined;
  let next: Promise<RefViewState> | undefined;
  const before = () => prior ??= captureRefViewState(context, tips);
  const after = () => next ??= before().then((state) => overlayRefViewState(context, state, groups));
  const view = (load: () => Promise<RefViewState>): StoreView => ({
    read: async (input) => readView(context, await load(), input),
    list: async (input) => listView(context, await load(), input),
    lookup: async (input) => lookupView(context, await load(), input),
  });
  return { before: view(before), after: view(after) };
}

function lookupView(context: RefBackendContext, state: RefViewState, input: LookupInput): StoreResult<LookupResult> {
  const trees = new Map<string, RefLookupTree>();
  for (const [ref, group] of state.refs) {
    if (!matchesFamilyRef(ref, "work-item") && !matchesFamilyRef(ref, "cohort") && ref !== "refs/arc/project/registry") continue;
    const family = viewRefFamily(ref);
    const metadata = family ? viewRefMetadata(context, state, ref, family) : null;
    if (!group.entries || !metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
      namespace: ref, ...metadataFailure(ref) } };
    trees.set(ref, { entries: group.entries, metadata });
  }
  return lookupCapturedRefTrees(context, input, trees);
}

async function listView(context: RefBackendContext, state: RefViewState, input: ListInput): Promise<StoreResult<ListingOutcome>> {
  if (FAMILY_REGISTRY[input.family].scope === "identity" && await context.identity() === null) return { status: "ok", result: { status: "absent" } };
  const refs = [...state.refs].filter(([ref]) => matchesFamilyRef(ref, input.family));
  if (refs.length === 0) return { status: "ok", result: { status: "absent" } };
  const groups = refs.map(([ref, group]) => decodeCapturedRef(context, input, ref, group.entries, state.objects, group.metadata));
  const diagnostics = groups.flatMap(({ diagnostics }) => diagnostics);
  if (groups.every(({ unreadable }) => unreadable)) return { status: "ok", result: { status: "unreadable",
    condition: diagnostics.map(({ condition }) => condition).join("; "), remedy: { text: diagnostics.map(({ remedy }) => remedy.text).join(" ") } } };
  return { status: "ok", result: { status: "complete", records: groups.flatMap(({ records }) => records), diagnostics, missed: diagnostics.length > 0 } };
}

async function readView(context: RefBackendContext, state: RefViewState, input: ReadInput): Promise<StoreResult<StoreRecord>> {
  let reference = input.reference;
  const invalid = checkRefKey(reference, context.registry);
  if (invalid) return { status: "refused", refusal: invalid };
  if (reference.owner.type === "person" && await context.identity() === null) return missing(reference, "Configure arc.identity before reading person-owned state.");
  if (needsOwnerLookup(reference)) {
    const query = reference.kind.startsWith("lineage/") ? { kind: "lineage" as const, origin: reference.owner.name }
      : { kind: "slug" as const, slug: reference.owner.name };
    const found = lookupView(context, state, query);
    if (found.status === "refused") return found;
    reference = RecordReferenceSchema.parse({ ...reference, owner: found.result.reference.owner });
  }
  let home = expandStoredPath(reference, { registry: context.registry });
  const group = state.refs.get(home.ref);
  if (!group) return missing(reference);
  const family = context.registry[reference.kind].family;
  const metadata = viewRefMetadata(context, state, home.ref, family);
  if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: home.ref, ...metadataFailure(home.ref) } };
  if (family !== "lineage") {
    reference = RecordReferenceSchema.parse({ ...reference, owner: refOwner(home.ref, family, metadata) });
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
  const listed = decodeCapturedRef(context, { family }, home.ref, group.entries, state.objects, group.metadata);
  const conflicts = listed.records.find((record) => sameReference(record.reference, reference))?.conflicts ?? [];
  const record = decodeRecord(context, reference, object, metadata, home.path, conflicts);
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
