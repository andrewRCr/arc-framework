/** Ordered field edits for re-pointing cohort holdings without violating Parent checks. */
import type { RuleObservation } from "../rule-support.js";
import type { CohortHolding, CohortHoldingCandidate, CohortHoldingSegment, ResolvedCohortCandidate } from "./holdings.js";

/** A field edit names the exact record whose authored value changes. */
export interface CohortHoldingEdit {
  record: { type: "work-unit" | "cohort"; name: string; uid: string };
  field: "cohort" | "parent";
  from: string | null;
  to: string | null;
}

/** Build safe ordered edits, preserving completion facts from the candidate view. */
export function cohortHoldingEdits(holdings: readonly CohortHolding[], slug: string): RuleObservation<readonly CohortHoldingEdit[]> {
  const parents = prepareParents(holdings, slug);
  if (parents.status !== "known") return parents;
  const { edits, handled } = parents.value;
  for (const holding of holdings) {
    if (handled.has(holding.candidate)) continue;
    const segments = new Set(holdings.filter(item => item.candidate === holding.candidate).map(item => item.segment));
    const edit = directEdit(holding, segments, slug);
    if (edit.status !== "known") return edit;
    if (edit.value !== null) edits.push(edit.value);
    handled.add(holding.candidate);
  }
  return { status: "known", value: edits };
}

function prepareParents(holdings: readonly CohortHolding[], slug: string): RuleObservation<{
  edits: CohortHoldingEdit[]; handled: Set<CohortHoldingCandidate> }> {
  const edits: CohortHoldingEdit[] = [], handled = new Set<CohortHoldingCandidate>();
  for (const holding of holdings) {
    if (holding.candidate.field !== "parent") continue;
    const closed = closedParentDisposition(holding, slug);
    if (closed === "keep") { markHandled(holding, handled); continue; }
    if (closed !== null) return closed;
    if (holding.candidate.path === slug) continue;
    const planned = parentEdits(holding, slug);
    if (planned.status !== "known") return planned;
    edits.push(...planned.value);
    markHandled(holding, handled);
  }
  return { status: "known", value: { edits, handled } };
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

function parentEdits(holding: CohortHolding, slug: string): RuleObservation<readonly CohortHoldingEdit[]> {
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

function directEdit(holding: ResolvedCohortCandidate, changed: ReadonlySet<number>, slug: string): RuleObservation<CohortHoldingEdit | null> {
  const parts = holding.segments.map((segment, index) => changed.has(index) ? slug
    : segment.status === "known" ? segment.currentSlug : segment.name);
  const to = parts.join("/");
  if (to === holding.candidate.path) return { status: "known", value: null };
  for (const [index, segment] of holding.segments.entries()) {
    if (!changed.has(index) && segment.status !== "known") return unresolvedSegment(segment, holding.candidate.path);
  }
  return fieldEdit(holding.candidate, holding.candidate.path, to);
}

function fieldEdit(candidate: CohortHoldingCandidate, from: string | null, to: string | null): RuleObservation<CohortHoldingEdit> {
  const { owner, kind } = candidate.reference;
  if ((kind !== "work-item/meta" && kind !== "cohort/document") || owner.type === "person" || owner.uid === undefined) {
    return { status: "unavailable", condition: `The exact holding owner of ${owner.name} is unavailable. Restore its record identity before re-pointing it.` };
  }
  return { status: "known", value: { record: { type: kind === "cohort/document" ? "cohort" : "work-unit", name: owner.name, uid: owner.uid },
    field: candidate.field, from, to } };
}

function unresolvedSegment(segment: CohortHoldingSegment | undefined, path: string): { status: "unavailable"; condition: string } {
  return { status: "unavailable", condition: segment?.status === "ambiguous"
    ? `The cohort path ${path} has an ambiguous child or companion segment. ${segment.condition} ${segment.remedy.text}`
    : `The cohort path ${path} has no proved current cohort at '${segment?.name ?? ""}'. Repair that path or clear Cohort before retrying.` };
}
