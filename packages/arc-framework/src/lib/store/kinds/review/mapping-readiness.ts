/** Compute publication readiness over imported record content without backend metadata. */
import { deriveReviewReadinessBinding, type ReviewReadinessListing } from "./integration-boundary/readiness.js";
import { coalesceReviewDecisionRecords } from "./mapping-decisions.js";
import type { ReviewMappingBoundaryContext } from "./mapping-boundary.js";
import type { ReviewMappingSource } from "./mapping-listing.js";
import type { IntegrationBoundaryLocus } from "../../../../scripts/review-gate/policy/integration-boundary-locus.js";

/** Join native lane version evidence to the same canonical binding used after import. */
export function mapReviewReadinessBinding(source: Extract<ReviewMappingSource, { kind: "boundary" }>,
  boundary: IntegrationBoundaryLocus, context: ReviewMappingBoundaryContext): string | null {
  const owners = [...context.indexed.operations.entries()].flatMap(([path, state]) =>
    state.kind === "lane-progress" && state.lane === "standard" && state.lineage.kind === "candidate"
      && state.lineage.candidateId === boundary.candidateId ? [{ path, state }] : []);
  if (owners.length > 1) throw new Error(`Readiness Candidate ${boundary.candidateId} has multiple standard lane owners.`);
  const current = owners[0];
  const currentVersion = current === undefined ? 0 : context.indexed.operationVersions.get(current.path);
  if (currentVersion === undefined) throw new Error("The imported standard lane owner has no source version.");
  const recordedVersion = "standardLaneOwnerVersion" in boundary ? boundary.standardLaneOwnerVersion : undefined;
  if (recordedVersion === undefined || recordedVersion !== currentVersion) return null;
  const records = coalesceReviewDecisionRecords(context.records).filter(({ reference }) =>
    reference.owner.type === "work-item" && reference.owner.uid === source.workItem.uid);
  const listing = (kind: string): ReviewReadinessListing => ({ status: "complete", missed: false, diagnostics: [],
    records: records.filter(({ reference }) => reference.kind === kind).map(({ reference, contents }) => {
      const content = contents.at(-1);
      if (content === undefined) throw new Error("A readiness record has no content.");
      return { reference, content };
    }) });
  const binding = deriveReviewReadinessBinding({ subjectOwner: { kind: "candidate", candidateId: boundary.candidateId },
    outcomes: listing("review/outcome"), evidence: listing("review/evidence"), decisions: listing("review/decision"),
    inFlight: current?.state.attempts.filter(({ outcome }) => outcome === "pending") ?? [] });
  if (binding.status !== "complete") throw new Error(`Cannot bind imported readiness: ${binding.condition}`);
  return binding.digest;
}
