/** Derive cohort closeout coordinates from registered fields in the complete prepared state. */

import { ArchiveSequenceSchema, type ArchiveQuarter } from "../../kernel/index.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import type { ReadPlacement } from "../placement.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { RefWriteGroup } from "./write-commits.js";
import type { PreparedRefMutation } from "./write-merge.js";
import type { RefArchivePlan } from "./write-archive.js";
import { captureRefViewState, overlayRefViewState, viewRefMetadata, type RefViewState } from "./view-state.js";
import { matchesFamilyRef, refOwner } from "./codec.js";
import { archivedFolders, isArchiveRef, latestArchivedFolders, type ArchivedFolder } from "./archive-read.js";
import type { RefTreeEntry } from "./batch-read.js";
import { readRefContent, recordDiagnostic } from "./content-read.js";

/** Gather parents through the registered parser, independently of unfinished closeout placement. */
export async function preparedCohortParents(context: RefBackendContext, tips: ReadonlyMap<string, string>,
  groups: ReadonlyMap<string, RefWriteGroup>): Promise<StoreResult<Set<string>>> {
  const parents = new Set<string>();
  if (!context.registry["cohort/document"].parser) return { status: "ok", result: parents };
  const state = await overlayRefViewState(context, await captureRefViewState(context, tips), groups);
  for (const [ref, group] of state.refs) {
    if (!matchesFamilyRef(ref, "cohort")) continue;
    const metadata = viewRefMetadata(context, state, ref, "cohort");
    if (!metadata || !group.entries) return unavailableCohort(ref);
    const reference = RecordReferenceSchema.parse({ owner: refOwner(ref, "cohort", metadata), kind: "cohort/document" });
    const result = collectParent(context, state, reference, group.entries, parents, ref);
    if (result.status === "refused") return result;
  }
  const archived = collectArchivedParents(context, state, parents);
  if (archived.status === "refused") return archived;
  return { status: "ok", result: parents };
}

/** Captured member assignments and parent facts used by one cohort close. */
export interface CohortCoordinateBasis {
  plans: readonly RefArchivePlan[]; writes: readonly PreparedRefMutation[]; parents: ReadonlySet<string>;
  fallback: ReturnType<typeof ArchiveSequenceSchema.parse>;
}

/** Borrow the highest same-quarter member number, otherwise allocate the quarter's next. */
export function cohortClosePlacement(context: RefBackendContext, reference: RecordReference, quarter: ArchiveQuarter,
  basis: CohortCoordinateBasis): ReadPlacement {
  let highest: bigint | undefined;
  for (const plan of basis.plans) {
    if (plan.reference.kind !== "work-item/meta" || plan.placement.kind !== "completed" || plan.placement.quarter !== quarter || !("sequence" in plan.placement)) continue;
    const write = basis.writes.find(({ home, mutation }) => home.ref === plan.source && mutation.reference.kind === "work-item/meta");
    const parsed = write?.mutation.action === "put" ? context.registry["work-item/meta"].parser?.(write.mutation.content) : undefined;
    const cohort = parsed?.success ? stringField(parsed.data, "cohort") : undefined;
    const sequence = BigInt(plan.placement.sequence);
    if (cohort?.split("/").includes(reference.owner.name) && (highest === undefined || sequence > highest)) highest = sequence;
  }
  return { kind: "completed", quarter, sequence: highest === undefined ? basis.fallback : ArchiveSequenceSchema.parse(String(highest).padStart(2, "0")),
    closeout: basis.parents.has(reference.owner.name) ? "b" : "a" };
}

function collectArchivedParents(context: RefBackendContext, state: RefViewState, parents: Set<string>): StoreResult<null> {
  const folders: ArchivedFolder[] = [];
  for (const [ref, group] of state.refs) {
    if (!isArchiveRef(ref)) continue;
    if (!group.entries) return unavailableCohort(ref);
    const decoded = archivedFolders("cohort", ref, group.entries, state.objects);
    if (decoded.diagnostics.length) return unavailableCohort(ref);
    folders.push(...decoded.folders);
  }
  for (const folder of latestArchivedFolders(folders)) {
    if (state.refs.has(folder.liveRef)) continue;
    const prepared = state.refs.get(folder.liveRef.replace("refs/arc/", "refs/arc/history/"));
    const reference = RecordReferenceSchema.parse({ owner: refOwner(folder.liveRef, "cohort", prepared?.metadata ?? folder.metadata), kind: "cohort/document" });
    const result = collectParent(context, state, reference, prepared?.entries ?? folder.entries, parents, folder.ref);
    if (result.status === "refused") return result;
  }
  return { status: "ok", result: null };
}

function collectParent(context: RefBackendContext, state: RefViewState, reference: RecordReference,
  entries: readonly RefTreeEntry[], parents: Set<string>, namespace: string): StoreResult<null> {
  const path = expandStoredPath(reference, { registry: context.registry }).path;
  const entry = entries.find((entry) => entry.path === path);
  if (!entry) return { status: "ok", result: null };
  const object = state.objects.get(entry.oid);
  if (object?.type !== "blob") return unavailableCohort(namespace);
  const content = readRefContent(context.registry["cohort/document"], object.bytes);
  if ("condition" in content) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference,
    rule: "store.cohort-parent", condition: content.condition, remedy: recordDiagnostic(path, content).remedy } };
  const parent = stringField(content.fields, "parent");
  if (parent) parents.add(parent);
  return { status: "ok", result: null };
}

function stringField(fields: unknown, key: string): string | undefined {
  if (typeof fields !== "object" || fields === null) return undefined;
  const value = (fields as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function unavailableCohort(namespace: string): StoreResult<never> {
  return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace,
    condition: "Cohort closeout requires the complete captured cohort documents and metadata.",
    remedy: { text: "Restore or fetch the missing cohort objects, then retry the close." } } };
}
