/** Cohort holdings resolved by owner identity across current and former path segments. */
import { OwnerIdentitySchema, recordReferences, sameOwner, type RecordReference } from "../../identity.js";
import { parseCohortDocument } from "./parser.js";
import { SlugSchema } from "../../../kernel/index.js";
import type { StoreView } from "../../write-check.js";
import type { StoreRecord } from "../../read.js";
import { observeNamedRecord, type NamedRecordObservation, type RuleObservation } from "../rule-support.js";

/** Candidate membership and completion facts come from the caller's selected view. */
export interface CohortHoldingCandidate {
  reference: RecordReference;
  field: "cohort" | "parent";
  path: string;
  completed: boolean;
}
/** Resolution-view records support repair prerequisites; candidate-view completion remains separate. */
export type CohortHoldingSegment =
  | { name: string; status: "known"; reference: RecordReference; currentSlug: string; resolutionRecord: StoreRecord }
  | ({ name: string; status: "ambiguous" } & Pick<Extract<NamedRecordObservation, { status: "ambiguous" }>,
    "candidates" | "condition" | "remedy" | "tie">)
  | { name: string; status: "absent" | "invalid" };
/** Complete segment evidence for one candidate, including indirect child members. */
export interface ResolvedCohortCandidate {
  candidate: CohortHoldingCandidate; segments: readonly CohortHoldingSegment[];
  /** The leaf’s own Parent binding, including one outside the selected cohort’s holdings. */
  parent?: CohortHoldingSegment;
}
/** A direct holding plus every member that a Parent repair must consider. */
export interface CohortHolding extends ResolvedCohortCandidate {
  segment: number;
  resolution: "sole" | "ambiguous";
  members: readonly ResolvedCohortCandidate[];
}

/** Resolve distinct cohort segments once, retaining exact and ambiguous owner holdings. */
export async function observeCohortHoldings(candidates: readonly CohortHoldingCandidate[], resolve: StoreView,
  cohort: RecordReference): Promise<RuleObservation<readonly CohortHolding[]>> {
  const resolved = await resolveCandidates(candidates, resolve);
  if (resolved.status !== "known") return resolved;
  const holdings: CohortHolding[] = [];
  for (const item of resolved.value) {
    for (const [segment, evidence] of item.segments.entries()) {
      const resolution = holdingResolution(evidence, cohort);
      if (resolution === null) continue;
      const members = item.candidate.field === "parent" ? cohortChildMembers(resolved.value, item.candidate.reference) : [];
      holdings.push({ ...item, segment, resolution, members });
    }
  }
  return { status: "known", value: holdings };
}

async function resolveCandidates(candidates: readonly CohortHoldingCandidate[], view: StoreView): Promise<RuleObservation<readonly ResolvedCohortCandidate[]>> {
  const cache = new Map<string, CohortHoldingSegment>(), resolved: ResolvedCohortCandidate[] = [];
  for (const candidate of candidates) {
    const segments: CohortHoldingSegment[] = [];
    for (const name of candidate.field === "parent" ? [candidate.path] : candidate.path.split("/")) {
      const segment = await observeCachedSegment(name, cache, view);
      if (segment.status === "unavailable") return segment;
      segments.push(segment);
    }
    const parent = await observeCandidateParent(candidate, segments, cache, view);
    if (parent.status !== "known") return parent;
    resolved.push({ candidate, segments, ...(parent.value === undefined ? {} : { parent: parent.value }) });
  }
  return { status: "known", value: resolved };
}

async function observeCandidateParent(candidate: CohortHoldingCandidate, segments: readonly CohortHoldingSegment[],
  cache: Map<string, CohortHoldingSegment>, view: StoreView): Promise<RuleObservation<CohortHoldingSegment | undefined>> {
  const leaf = segments.at(-1);
  if (candidate.field !== "cohort" || leaf?.status !== "known") return { status: "known", value: undefined };
  const parsed = parseCohortDocument(leaf.resolutionRecord.content);
  if (!parsed.success) return { status: "unavailable", condition: parsed.error };
  if (parsed.data.parent === null) return { status: "known", value: undefined };
  const observed = await observeCachedSegment(parsed.data.parent, cache, view);
  if (observed.status === "unavailable") return observed;
  return { status: "known", value: observed };
}

async function observeCachedSegment(name: string, cache: Map<string, CohortHoldingSegment>, view: StoreView): Promise<
  CohortHoldingSegment | { status: "unavailable"; condition: string }> {
  const observed = cache.get(name) ?? await observeSegment(name, view);
  if (observed.status !== "unavailable") cache.set(name, observed);
  return observed;
}

async function observeSegment(name: string, view: StoreView): Promise<CohortHoldingSegment | { status: "unavailable"; condition: string }> {
  if (!SlugSchema.safeParse(name).success) return { name, status: "invalid" };
  const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name }));
  const observed = await observeNamedRecord(view, reference);
  if (observed.status === "unavailable") return observed;
  if (observed.status === "known") return { name, status: "known", reference: observed.value.reference,
    currentSlug: observed.value.reference.owner.name, resolutionRecord: observed.value };
  return { name, ...observed };
}

function holdingResolution(segment: CohortHoldingSegment | undefined, target: RecordReference): "sole" | "ambiguous" | null {
  if (segment?.status === "known" && sameOwner(segment.reference.owner, target.owner)) return "sole";
  return segment?.status === "ambiguous" && segment.candidates.some(reference => sameOwner(reference.owner, target.owner))
    ? "ambiguous" : null;
}

/** Include every member whose leaf can name the selected child, including ambiguous candidates. */
export function cohortChildMembers(candidates: readonly ResolvedCohortCandidate[], child: RecordReference): readonly ResolvedCohortCandidate[] {
  return candidates.filter(item => item.candidate.field === "cohort" && holdingResolution(item.segments.at(-1), child) !== null);
}
