/** Derive cohort closeout coordinates from registered fields in the complete prepared state. */

import { ArchiveSequenceSchema, type ArchiveQuarter } from "../../kernel/index.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import type { ReadPlacement } from "../placement.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { RefWriteGroup } from "./write-commits.js";
import type { PreparedRefMutation } from "./write-merge.js";
import { captureRefViewState, overlayRefViewState, viewRefMetadata, type RefViewState } from "./view-state.js";
import { matchesFamilyRef, refOwner } from "./codec.js";
import { captureArchivedFolders, selectEndedOwners } from "./ended-owners.js";
import type { RefTreeEntry } from "./batch-read.js";
import { readRefContent, recordDiagnostic } from "./content-read.js";
import { corruptRef } from "./namespace-health.js";

/** Gather parents through the registered parser, independently of unfinished closeout placement. */
export async function preparedCohortParents(context: RefBackendContext, tips: ReadonlyMap<string, string>,
  groups: ReadonlyMap<string, RefWriteGroup>): Promise<StoreResult<Set<string>>> {
  const parents = new Set<string>();
  if (!context.registry["cohort/document"].parser) return { status: "ok", result: parents };
  const state = await overlayRefViewState(context, await captureRefViewState(context, tips), groups);
  for (const [ref, group] of state.refs) {
    if (!matchesFamilyRef(ref, "cohort")) continue;
    const metadata = viewRefMetadata(context, state, ref, "cohort");
    if (!metadata || !group.entries) return unavailableCohort(ref, !group.entries);
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
  members: readonly PreparedMemberPlacement[]; parents: ReadonlySet<string>;
  fallback: ReturnType<typeof ArchiveSequenceSchema.parse>;
}

/** A member's prepared content and final placement, whether it ends live or transfers between quarters. */
export interface PreparedMemberPlacement { write: PreparedRefMutation; placement: ReadPlacement }

/** Borrow the highest same-quarter member number, otherwise allocate the quarter's next. */
export function cohortClosePlacement(context: RefBackendContext, reference: RecordReference, quarter: ArchiveQuarter,
  basis: CohortCoordinateBasis): ReadPlacement {
  let highest: bigint | undefined;
  for (const { write, placement } of basis.members) {
    if (write.mutation.reference.kind !== "work-item/meta" || placement.kind !== "completed" || placement.quarter !== quarter || !("sequence" in placement)) continue;
    const parsed = write.mutation.action === "put" ? context.registry["work-item/meta"].parser?.(write.mutation.content) : undefined;
    const cohort = parsed?.success ? stringField(parsed.data, "cohort") : undefined;
    const sequence = BigInt(placement.sequence);
    if (cohort?.split("/").includes(reference.owner.name) && (highest === undefined || sequence > highest)) highest = sequence;
  }
  return { kind: "completed", quarter, sequence: highest === undefined ? basis.fallback : ArchiveSequenceSchema.parse(String(highest).padStart(2, "0")),
    closeout: basis.parents.has(reference.owner.name) ? "b" : "a" };
}

function collectArchivedParents(context: RefBackendContext, state: RefViewState, parents: Set<string>): StoreResult<null> {
  const { folders, diagnostics } = selectEndedOwners(state, captureArchivedFolders(state, "cohort"));
  const first = diagnostics[0];
  if (first) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: first.key.split(":")[0] ?? first.key,
    condition: first.condition, remedy: first.remedy } };
  for (const folder of folders) {
    const reference = RecordReferenceSchema.parse({ owner: folder.owner, kind: "cohort/document" });
    const result = collectParent(context, state, reference, folder.entries, parents, folder.ref);
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

function unavailableCohort(namespace: string, missingObjects = true): StoreResult<never> {
  return { status: "refused", refusal: corruptRef(namespace, missingObjects) };
}
