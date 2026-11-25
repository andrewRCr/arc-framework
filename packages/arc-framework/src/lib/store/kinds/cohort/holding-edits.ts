/** Ordered field edits for re-pointing cohort holdings without violating Parent checks. */
import type { RuleObservation } from "../rule-support.js";
import type { CohortHolding, CohortHoldingCandidate, CohortHoldingSegment, ResolvedCohortCandidate } from "./holdings.js";
import { cohortChildMembers } from "./holdings.js";
import { sameOwner, type RecordReference } from "../../identity.js";
import { parseCohortDocument } from "./parser.js";
import { describeRecordConflicts } from "../../conflict-diagnostics.js";

/** A field edit names the exact record whose authored value changes. */
export interface CohortHoldingEdit {
  record: { type: "work-unit" | "cohort"; name: string; uid: string };
  field: "cohort" | "parent";
  from: string | null;
  to: string | null;
}

/** A proved edit sequence and retained groups whose identities must be repaired first. */
export interface CohortHoldingRepairPlan {
  edits: CohortHoldingEdit[];
  deferred: { candidates: readonly CohortHoldingCandidate[]; condition: string }[];
}
type DeferredRepair = { status: "deferred"; condition: string };
type EditObservation<T> = RuleObservation<T> | DeferredRepair;
interface ParentRepair { holding: CohortHolding; target: string }
interface ParentPrerequisite { child: RecordReference; repair: RuleObservation<ParentRepair> }

/** Plan admissible field edits separately from unresolved identity prerequisites. With the subject cohort's Parent
 * (`null` when top-level), a tied leaf segment re-points to the subject's own path under that Parent, the only path the
 * Parent check admits for it.
 */
export function cohortHoldingRepairs(holdings: readonly CohortHolding[], slug: string,
  subjectParent?: string | null): RuleObservation<CohortHoldingRepairPlan> {
  const parents = prepareParents(holdings, slug);
  if (parents.status !== "known") return parents;
  const { plan, handled } = parents.value;
  for (const holding of holdings) {
    if (handled.has(holding.candidate)) continue;
    const segments = new Set(holdings.filter(item => item.candidate === holding.candidate).map(item => item.segment));
    const edit = formerParentLeafEdit(holding) ?? directEdit(holding, segments, slug, subjectParent);
    if (edit.status === "deferred") plan.deferred.push({ candidates: [holding.candidate], condition: edit.condition });
    else if (edit.status !== "known") return edit;
    else if (edit.value !== null) plan.edits.push(edit.value);
    handled.add(holding.candidate);
  }
  return { status: "known", value: plan };
}

function prepareParents(holdings: readonly CohortHolding[], slug: string): RuleObservation<{
  plan: CohortHoldingRepairPlan; handled: Set<CohortHoldingCandidate> }> {
  const prerequisites = parentPrerequisites(holdings, slug);
  if (prerequisites.status !== "known") return prerequisites;
  const plan: CohortHoldingRepairPlan = { edits: [], deferred: [] }, handled = new Set<CohortHoldingCandidate>();
  for (const { holding, target } of prerequisites.value) {
    const closed = closedParentDisposition(holding, target);
    if (closed === "keep") { markHandled(holding, handled); continue; }
    if (closed !== null) return closed;
    if (holding.candidate.path === target) continue;
    const planned = parentEdits(holding, target);
    if (planned.status === "deferred") plan.deferred.push({
      candidates: [holding.candidate, ...holding.members.map(member => member.candidate)], condition: planned.condition });
    else if (planned.status !== "known") return planned;
    else plan.edits.push(...planned.value);
    markHandled(holding, handled);
  }
  return { status: "known", value: { plan, handled } };
}

function parentPrerequisites(holdings: readonly CohortHolding[], slug: string): RuleObservation<ParentRepair[]> {
  const result = holdings.filter(holding => holding.candidate.field === "parent").map(holding => ({ holding, target: slug }));
  const candidates = [...new Map([...holdings, ...holdings.flatMap(holding => holding.members)].map(item => [item.candidate, item])).values()];
  const discovered = holdings.flatMap(holding => {
    const leaf = holding.segments.at(-1);
    if (leaf?.status === "known" && hasParentRepair(result, leaf.reference)) return [];
    const prerequisite = childParentPrerequisite(holding, holdings, candidates, slug);
    return prerequisite === null ? [] : [prerequisite];
  });
  // A proved child group covers all its members, including other-prefix paths.
  for (const item of discovered) {
    if (item.repair.status === "known" && !hasParentRepair(result, item.child)) result.push(item.repair.value);
  }
  const blocked = discovered.find(item => item.repair.status !== "known" && !hasParentRepair(result, item.child));
  if (blocked !== undefined && blocked.repair.status !== "known") return blocked.repair;
  return { status: "known", value: result };
}

function hasParentRepair(repairs: readonly ParentRepair[], child: RecordReference): boolean {
  return repairs.some(item => sameOwner(item.holding.candidate.reference.owner, child.owner));
}

function childParentPrerequisite(holding: CohortHolding, holdings: readonly CohortHolding[],
  candidates: readonly ResolvedCohortCandidate[], slug: string): ParentPrerequisite | null {
  if (holding.candidate.field !== "cohort" || holding.segments.length !== 2 || formerParentLeafEdit(holding) !== null) return null;
  const leaf = holding.segments.at(-1), parent = holding.segments[0];
  if (leaf?.status !== "known" || parent?.status !== "known" || leaf.resolutionRecord.placement?.kind === "completed") return null;
  const child = leaf.reference, parsed = parseCohortDocument(leaf.resolutionRecord.content);
  if (!parsed.success) return { child, repair: { status: "unavailable", condition: parsed.error } };
  const changed = holdings.some(item => item.candidate === holding.candidate && item.segment === 0);
  const target = changed ? slug : parent.currentSlug;
  if (parsed.data.parent === target) return null;
  const proof = holding.parent;
  if (parsed.data.parent === null || proof?.status !== "known" || !sameOwner(proof.reference.owner, parent.reference.owner)) {
    return { child, repair: { status: "unavailable",
      condition: `The path ${holding.candidate.path} has no proved matching Parent. Repair Parent or clear Cohort before re-pointing it.` } };
  }
  const candidate: CohortHoldingCandidate = { reference: child, field: "parent", path: parsed.data.parent, completed: false };
  return { child, repair: { status: "known", value: { holding: { candidate, segments: [proof], segment: 0, resolution: "sole",
    members: cohortChildMembers(candidates, child) }, target } } };
}

function markHandled(holding: CohortHolding, handled: Set<CohortHoldingCandidate>): void {
  handled.add(holding.candidate);
  for (const member of holding.members) handled.add(member.candidate);
}

function closedParentDisposition(holding: CohortHolding, slug: string): "keep" | { status: "unavailable"; condition: string } | null {
  if (!holding.candidate.completed) return null;
  if (holding.resolution === "ambiguous") return "keep";
  if (holding.candidate.path === slug) return null;
  return holding.members.some(member => !member.candidate.completed)
    ? { status: "unavailable", condition: `Closed subcohort '${holding.candidate.reference.owner.name}' has open members. `
      + "Keep Parent unchanged, or have their owners move or clear Cohort before changing Parent. "
      + "Cleared memberships cannot be restored onto this closed cohort." } : null;
}

function parentEdits(holding: CohortHolding, slug: string): EditObservation<readonly CohortHoldingEdit[]> {
  const eligible = parentTargetEligibility(holding.segments[0]);
  if (eligible.status !== "known") return eligible;
  const parent = fieldEdit(holding.candidate, holding.candidate.path, slug);
  if (parent.status !== "known") return parent;
  const clears: CohortHoldingEdit[] = [], restores: CohortHoldingEdit[] = [], completed: CohortHoldingEdit[] = [];
  const next = `${slug}/${holding.candidate.reference.owner.name}`;
  for (const member of holding.members) {
    const leaf = member.segments.at(-1);
    if (leaf?.status !== "known") return unresolvedSegment(leaf, member.candidate.path);
    const edit = fieldEdit(member.candidate, member.candidate.completed ? member.candidate.path : null, next);
    if (edit.status !== "known") return edit;
    if (member.candidate.completed) completed.push(edit.value);
    else {
      const clear = fieldEdit(member.candidate, member.candidate.path, null);
      if (clear.status !== "known") return clear;
      clears.push(clear.value);
      restores.push(edit.value);
    }
  }
  return { status: "known", value: [...clears, parent.value, ...restores, ...completed] };
}

function parentTargetEligibility(segment: CohortHoldingSegment | undefined): RuleObservation<true> {
  if (segment?.status !== "known") return { status: "known", value: true };
  const record = segment.resolutionRecord;
  const fail = (condition: string): RuleObservation<true> => ({ status: "unavailable", condition: `${condition} Keep Parent unchanged or clear Cohort before choosing another group.` });
  if (record.conflicts.length > 0) return fail(`The parent is disputed.${describeRecordConflicts(record.conflicts)}`);
  if (record.placement?.kind === "completed") return fail("The parent is completed; a changed Parent must name an open cohort.");
  const parsed = parseCohortDocument(record.content);
  if (!parsed.success) return fail(parsed.error);
  return parsed.data.parent === null ? { status: "known", value: true } : fail("The parent is already nested; a changed Parent must name a top-level cohort.");
}

/** A sole former parent name cannot override an open leaf's own Parent. Keep the holding while withholding an
 * unsupported edit; a top-level leaf can instead be named directly. Closed-leaf safeguards stay with their planner. */
function formerParentLeafEdit(holding: CohortHolding): EditObservation<CohortHoldingEdit | null> | null {
  const first = holding.segments[0], leaf = holding.segments.at(-1);
  if (holding.candidate.field !== "cohort" || holding.segments.length !== 2 || holding.segment !== 0
    || holding.resolution !== "sole" || first?.status !== "known" || first.name === first.currentSlug
    || leaf?.status !== "known" || leaf.resolutionRecord.placement?.kind === "completed") return null;
  const parent = holding.parent;
  if (parent?.status === "known") return sameOwner(parent.reference.owner, first.reference.owner)
    ? null : { status: "known", value: null };
  if (parent === undefined) return fieldEdit(holding.candidate, holding.candidate.path, leaf.currentSlug);
  return { status: "deferred", condition: `The path ${holding.candidate.path} has an unresolved leaf Parent '${parent.name}'. `
    + "Have its owner resolve Parent or clear Cohort before choosing the intended current path." };
}

function directEdit(holding: ResolvedCohortCandidate, changed: ReadonlySet<number>, slug: string,
  subjectParent: string | null | undefined): EditObservation<CohortHoldingEdit | null> {
  const parts = tiedLeafNamesSubject(holding, changed, slug, subjectParent) ? (subjectParent === null ? [slug] : [subjectParent, slug])
    : holding.segments.map((segment, index) => changed.has(index) ? slug : segment.status === "known" ? segment.currentSlug : segment.name);
  const to = parts.join("/");
  if (to === holding.candidate.path) return { status: "known", value: null };
  for (const [index, segment] of holding.segments.entries()) {
    if (!changed.has(index) && segment.status !== "known") return unresolvedSegment(segment, holding.candidate.path);
  }
  const closed = closedLeafDisposition(holding, parts, changed);
  if (closed !== null) return closed;
  return fieldEdit(holding.candidate, holding.candidate.path, to);
}

/** An edit that moves a tied leaf off the tied name names the subject, whose Parent the path must then agree with. A leaf
 * already on the subject's own slug stays tied, so no edit leaves the tie and none is given. */
function tiedLeafNamesSubject(holding: ResolvedCohortCandidate, changed: ReadonlySet<number>, slug: string,
  subjectParent: string | null | undefined): subjectParent is string | null {
  const leaf = holding.segments.at(-1);
  return subjectParent !== undefined && holding.candidate.field === "cohort" && changed.has(holding.segments.length - 1)
    && leaf?.status === "ambiguous" && leaf.name !== slug;
}

/** A cohort document's Parent, `null` when top-level, or undefined when the document does not parse. */
export function cohortDocumentParent(content: string): string | null | undefined {
  const parsed = parseCohortDocument(content);
  return parsed.success ? parsed.data.parent : undefined;
}

function closedLeafDisposition(holding: ResolvedCohortCandidate, parts: readonly string[], changed: ReadonlySet<number>): RuleObservation<null> | null {
  const leaf = holding.segments.at(-1);
  if (holding.candidate.field !== "cohort" || leaf?.status !== "known" || leaf.resolutionRecord.placement?.kind !== "completed") return null;
  const record = leaf.resolutionRecord, parsed = parseCohortDocument(record.content);
  if (record.conflicts.length > 0) return { status: "unavailable", condition: `The completed child Parent is disputed.${describeRecordConflicts(record.conflicts)}` };
  if (!parsed.success) return { status: "unavailable", condition: `The completed child Parent is unavailable: ${parsed.error}` };
  const parent = parts.length === 2 ? parts[0] : null;
  if (parsed.data.parent === parent) return null;
  const priorParent = holding.segments[0];
  if (changed.has(0) && priorParent?.status === "ambiguous" && parsed.data.parent === priorParent.name) return { status: "known", value: null };
  return { status: "unavailable", condition: `Closed subcohort '${record.reference.owner.name}' still has Parent ${JSON.stringify(parsed.data.parent)}. `
    + "Keep Parent unchanged, or have its open members' owners move or clear Cohort before changing Parent. "
    + "Cleared memberships cannot be restored onto this closed cohort." };
}

function fieldEdit(candidate: CohortHoldingCandidate, from: string | null, to: string | null): RuleObservation<CohortHoldingEdit> {
  const { owner, kind } = candidate.reference;
  if ((kind !== "work-item/meta" && kind !== "cohort/document") || owner.type === "person" || owner.uid === undefined) {
    return { status: "unavailable", condition: `The exact holding owner of ${owner.name} is unavailable. Restore its record identity before re-pointing it.` };
  }
  return { status: "known", value: { record: { type: kind === "cohort/document" ? "cohort" : "work-unit", name: owner.name, uid: owner.uid },
    field: candidate.field, from, to } };
}

function unresolvedSegment(segment: CohortHoldingSegment | undefined, path: string): DeferredRepair {
  return { status: "deferred", condition: segment?.status === "ambiguous"
    ? `The cohort path ${path} has an ambiguous child or companion segment. ${segment.condition} ${segment.remedy.text}`
    : `The cohort path ${path} has no proved current cohort at '${segment?.name ?? ""}'. Resolve that path or clear Cohort before choosing a new membership.` };
}
