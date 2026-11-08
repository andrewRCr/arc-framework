/** A cohort rename's refusal, before its batch, of a Parent it moves that the Parent check would refuse. */
import type { StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences, sameReference, sameOwner, type RecordReference } from "./identity.js";
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { observeNamedRecord } from "./kinds/rule-support.js";
import { parseCohortDocument } from "./kinds/cohort/index.js";
import { cohortParentConflicts } from "./kinds/cohort/parent-conflicts.js";
import type { CohortEvidence, CohortHolding, CohortMemberEvidence } from "./kinds/cohort/check-support.js";
import type { StoreView } from "./write-check.js";

/** The batch a cohort rename has planned, before it writes. */
export interface PlannedCohortRename {
  primary: StoreRecord; target: string; records: readonly StoreRecord[];
  contents: ReadonlyMap<StoreRecord, string>;
  /** Each member Cohort path the batch writes. */
  paths: ReadonlyMap<StoreRecord, string>;
}
interface MovedParent { child: StoreRecord; name: string; parent: string | null }
interface ParentConflict { moved: MovedParent; record: StoreRecord; field: "cohort" | "parent"; path: string }
const OK: StoreResult<true> = { status: "ok", result: true };

/** Refuse the rename, writing nothing, where a cohort whose Parent it moves would fail the Parent check over open records
 * the batch leaves in place. A closed subcohort whose sole Parent is the renamed cohort counts as moved even where the
 * batch keeps its Parent for a retained group, since a Parent left on what becomes a former slug would strand its open
 * members. Each conflicting record's exits are named by resolution, those keeping membership first.
 * @param view - The rename's captured store view.
 * @param plan - The planned batch.
 * @param holdings - Every holding of the renamed cohort.
 * @returns Success, or the refusal naming each conflicting record and its exits.
 */
export async function refuseParentConflicts(view: StoreView, plan: PlannedCohortRename, holdings: readonly CohortHolding[]): Promise<StoreResult<true>> {
  const moved = movedParents(plan, holdings);
  if (moved.length === 0) return OK;
  const { cohorts, members } = plannedOpenState(plan);
  const conflicts = moved.flatMap((item): ParentConflict[] => {
    const found = cohortParentConflicts(item.name, item.parent, cohorts, members);
    return [...found.members.map(member => ({ moved: item, record: member.record, field: "cohort" as const, path: member.cohort ?? "" })),
      ...found.nesting.map(cohort => ({ moved: item, record: cohort.record, field: "parent" as const, path: cohort.fields.parent ?? "" }))];
  });
  const first = conflicts[0];
  if (first === undefined) return OK;
  const remedies = new Set<string>();
  for (const conflict of conflicts) {
    const exits = await conflictExits(view, plan, conflict);
    if (exits.status === "refused") return exits;
    remedies.add(`For ${describeOwner(conflict.record.reference)}: ${exits.result.join(", or ")}.`);
  }
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: first.moved.child.reference,
    rule: "lifecycle.rename", condition: "A cohort whose Parent names this cohort must name the new slug, but the Parent check "
      + `would refuse that over open records the batch cannot settle: ${conflicts.map(describeConflict).join("; ")}.`,
    remedy: { text: `${[...remedies].join(" ")} Then retry the rename.` } } };
}

function movedParents(plan: PlannedCohortRename, holdings: readonly CohortHolding[]): MovedParent[] {
  const moved: MovedParent[] = [];
  for (const record of plan.records) {
    if (record.reference.kind !== "cohort/document") continue;
    const before = parseCohortDocument(record.content), after = parseCohortDocument(plan.contents.get(record) ?? record.content);
    if (!before.success || !after.success || before.data.parent === after.data.parent) continue;
    moved.push({ child: record, name: own(plan, record) ? plan.target : record.reference.owner.name, parent: after.data.parent });
  }
  for (const holding of holdings) {
    if (holding.candidate.field !== "parent" || !holding.candidate.completed || holding.resolution !== "sole"
      || holding.candidate.path === plan.target || moved.some(item => sameReference(item.child.reference, holding.candidate.reference))) continue;
    const child = plan.records.find(record => sameReference(record.reference, holding.candidate.reference));
    if (child !== undefined) moved.push({ child, name: child.reference.owner.name, parent: plan.target });
  }
  return moved;
}

function plannedOpenState(plan: PlannedCohortRename): { cohorts: CohortEvidence[]; members: CohortMemberEvidence[] } {
  const open = plan.records.filter(record => record.placement?.kind !== "completed");
  return { cohorts: open.flatMap(record => plannedCohort(plan, record)), members: open.flatMap(record => plannedMember(plan, record)) };
}

function plannedCohort(plan: PlannedCohortRename, record: StoreRecord): CohortEvidence[] {
  if (record.reference.kind !== "cohort/document") return [];
  const parsed = parseCohortDocument(plan.contents.get(record) ?? record.content);
  if (!parsed.success) return [];
  const reference = own(plan, record)
    ? RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: plan.target } }) : record.reference;
  return [{ record: { ...record, reference }, fields: parsed.data }];
}

function plannedMember(plan: PlannedCohortRename, record: StoreRecord): CohortMemberEvidence[] {
  if (record.reference.kind !== "work-item/meta") return [];
  const fields = ParsedMetaRecordSchema.safeParse(record.fields);
  const cohort = plan.paths.get(record) ?? (fields.success ? fields.data.cohort : undefined);
  return cohort === undefined ? [] : [{ record, cohort }];
}

/** Each exit that lets the rename land once taken: renames that move the record off the moved cohort's name, then, for
 * the moved cohort's own member, the owner's edit to its current path, then the owner's clear. */
async function conflictExits(view: StoreView, plan: PlannedCohortRename, conflict: ParentConflict): Promise<StoreResult<string[]>> {
  const { moved: { child, name }, field, path } = conflict;
  const named = await observeNamedRecord(view, cohortReference(name));
  if (named.status === "unavailable") return unavailable(plan, named.condition);
  const renames = await renameExits(view, plan, conflict, named.status === "known" ? named.value : undefined);
  if (renames.status === "refused") return renames;
  const ownMember = field === "cohort" && path.split("/").at(-1) === name, exits = [...renames.result];
  if (ownMember && named.status === "known" && sameReference(named.value.reference, child.reference)) {
    const current = await currentChildPath(view, plan, child, name);
    if (current.status === "refused") return current;
    if (current.result !== undefined && current.result !== path) exits.push(`have its owner set its Cohort to ${JSON.stringify(current.result)}`);
  }
  exits.push(field === "parent" ? "have its owner clear its open members' Cohort and then its Parent"
    : `have its owner clear its Cohort${ownMember && child.placement?.kind === "completed" ? `, after which it cannot rejoin closed subcohort ${name}` : ""}`);
  return { status: "ok", result: exits };
}

/** The renames that move a record off the name: a live namesake's own, the other holders' of a tied first segment, and
 * an open moved cohort's own. */
async function renameExits(view: StoreView, plan: PlannedCohortRename, conflict: ParentConflict,
  named: StoreRecord | undefined): Promise<StoreResult<string[]>> {
  const { moved: { child, name }, field, path } = conflict, exits: string[] = [];
  if (named !== undefined && !sameReference(named.reference, child.reference) && !own(plan, named) && named.placement?.kind !== "completed") {
    const settles = await namesakeSettles(view, plan, named, name, conflict);
    if (settles.status === "refused") return settles;
    if (settles.result) exits.push(renameExit(named.reference));
  }
  if (field === "cohort") {
    const tied = await tiedHolders(view, plan, path, name);
    if (tied.status === "refused") return tied;
    exits.push(...tied.result.map(renameExit));
  }
  if (child.placement?.kind !== "completed" && !own(plan, child)) exits.push(renameExit(child.reference));
  return { status: "ok", result: exits };
}

/** Whether a live namesake's own rename moves the record off the name: a subcohort whose Parent names it, or a member whose
 * path agrees with the namesake's or its subcohort's Parent. A path disagreeing with its leaf's Parent stays (A8). */
async function namesakeSettles(view: StoreView, plan: PlannedCohortRename, namesake: StoreRecord, name: string,
  conflict: ParentConflict): Promise<StoreResult<boolean>> {
  if (conflict.field === "parent") return { status: "ok", result: true };
  const parts = conflict.path.split("/"), leaf = parts.at(-1);
  if (leaf === name) return { status: "ok", result: parts.length <= 2 && parentText(namesake) === (parts.length === 2 ? parts[0] : null) };
  if (parts.length !== 2 || parts[0] !== name || leaf === undefined) return { status: "ok", result: false };
  const subcohort = await observeNamedRecord(view, cohortReference(leaf));
  if (subcohort.status === "unavailable") return unavailable(plan, subcohort.condition);
  return { status: "ok", result: subcohort.status === "known" && parentText(subcohort.value) === name };
}

/** The other holders of a live current-name tie on a path's first segment: renaming one leaves it a former holder, which
 * the renamed cohort's current name outranks. A former-name tie has none, since former names persist. */
async function tiedHolders(view: StoreView, plan: PlannedCohortRename, path: string, name: string): Promise<StoreResult<RecordReference[]>> {
  const parts = path.split("/"), first = parts[0], primary = plan.primary.reference.owner;
  if (parts.length !== 2 || first === undefined || first === name) return { status: "ok", result: [] };
  const observed = await observeNamedRecord(view, cohortReference(first));
  if (observed.status === "unavailable") return unavailable(plan, observed.condition);
  const tied = observed.status === "ambiguous" && observed.tie?.liveness === "live" && observed.tie.name === "current"
    && observed.candidates.some(candidate => sameOwner(candidate.owner, primary));
  return { status: "ok", result: tied ? observed.candidates.filter(candidate => !sameOwner(candidate.owner, primary)) : [] };
}

/** The subcohort's current path, where its Parent names its parent's current slug, so a member's edit to it is admitted. */
async function currentChildPath(view: StoreView, plan: PlannedCohortRename, child: StoreRecord, name: string): Promise<StoreResult<string | undefined>> {
  const parent = parentText(child);
  if (parent === null || parent === undefined) return { status: "ok", result: undefined };
  const observed = await observeNamedRecord(view, cohortReference(parent));
  if (observed.status === "unavailable") return unavailable(plan, observed.condition);
  return { status: "ok", result: observed.status === "known" && observed.value.reference.owner.name === parent ? `${parent}/${name}` : undefined };
}

function parentText(record: StoreRecord): string | null | undefined {
  const parsed = parseCohortDocument(record.content);
  return parsed.success ? parsed.data.parent : undefined;
}

function cohortReference(name: string): RecordReference {
  return recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name }));
}

function own(plan: PlannedCohortRename, record: StoreRecord): boolean {
  return sameReference(record.reference, plan.primary.reference);
}

function renameExit(reference: RecordReference): string {
  return `rename cohort ${reference.owner.name} with \`arc rename ${ownerUid(reference)} <new-slug>\``;
}

function describeConflict(conflict: ParentConflict): string {
  const at = conflict.field === "cohort" ? `at ${JSON.stringify(conflict.path)}` : `with Parent ${JSON.stringify(conflict.path)}`;
  return `${describeOwner(conflict.record.reference)} ${at} under ${describeOwner(conflict.moved.child.reference)}`;
}

function describeOwner(reference: RecordReference): string {
  return `${reference.kind === "cohort/document" ? "cohort" : "work unit"} ${reference.owner.name} (UID ${ownerUid(reference)})`;
}

function ownerUid(reference: RecordReference): string {
  return reference.owner.type === "person" ? "unavailable" : reference.owner.uid ?? "unavailable";
}

function unavailable(plan: PlannedCohortRename, condition: string): StoreResult<never> {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", rule: "lifecycle.rename",
    reference: plan.primary.reference, condition,
    remedy: { text: "Restore the named cohort's evidence and retry the rename." } } };
}
