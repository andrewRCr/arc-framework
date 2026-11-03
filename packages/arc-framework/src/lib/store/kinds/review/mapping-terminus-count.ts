/** Reuse stored lane accounting for a legacy replay's unstored terminus basis. */
import { parseCandidateManagedRecord, resolveCandidateSupersessionAncestors } from "../../../work-unit/candidate-attestation.js";
import { deriveReviewOutcomePassCounts } from "./outcome/counts.js";
import { candidateRevisionContents } from "./mapping-candidates.js";
import type { ReviewOutcomeEvidence } from "./outcome/settlement.js";
import type { MappedReviewOutcome } from "./mapping-source-listing.js";
import type { ReviewMappingInput, ReviewMappingResult } from "./mapping-types.js";
import type { ReviewMappingSource } from "./mapping-listing.js";
import type { IntegrationBoundaryLocus } from "../../../../scripts/review-gate/policy/integration-boundary-locus.js";

/** Count completed logical passes, including settled inherited Candidate histories. */
export function mappingTerminusPassCount(source: Extract<ReviewMappingSource, { kind: "boundary" }>,
  boundary: IntegrationBoundaryLocus, input: ReviewMappingInput, mapped: readonly MappedReviewOutcome[],
  records: ReviewMappingResult["records"]): number {
  const candidate = input.candidates.find(({ workItem }) => workItem === source.workItem.uid);
  const contents = candidate === undefined ? [] : candidateRevisionContents(candidate);
  const history = contents.reverse().flatMap((content) => {
    const record = parseCandidateManagedRecord(content);
    return record === null || record.attestation.workUnit !== source.workItem.slug ? [] : [record];
  });
  const current = history.find(({ attestation }) => attestation.candidateId === boundary.candidateId);
  if (current === undefined) throw new Error(`Replay terminus Candidate ${boundary.candidateId} has no readable record.`);
  const ancestors = resolveCandidateSupersessionAncestors(current, history);
  const outcomes = mapped.map(({ outcome }) => outcome);
  const evidence = records.filter(({ reference }) => reference.kind === "review/evidence")
    .map(({ contents }) => {
      const content = contents[0];
      if (content === undefined) throw new Error("Mapped evidence has no content.");
      return JSON.parse(content) as ReviewOutcomeEvidence;
    });
  return deriveReviewOutcomePassCounts({ lane: "standard", lineage: { kind: "candidate", candidateId: boundary.candidateId },
    outcomes, evidence, ancestors: ancestors.map(({ candidateId }) => ({
      lineage: { kind: "candidate", candidateId }, outcomes, evidence })) }).completedPasses;
}
