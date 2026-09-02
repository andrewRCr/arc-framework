/** Shared Candidate projections for tests that exercise durable recorded state. */

import { canonicalDigest } from "../../src/lib/canonical/canonical-json.js";
import {
  createCandidateSubjectSnapshot,
  reduceCandidateDurableBaseline,
} from "../../src/lib/work-unit/candidate-attestation.js";
import { classifyCandidateApplicability } from
  "../../src/lib/work-unit/candidate-applicability.js";
import {
  projectEffectiveCandidateTarget,
  type CandidateTargetProjector,
} from "../../src/lib/work-unit/candidate-effective-target.js";

/**
 * Project the exact durable Candidate baseline without admitting an applicability decision.
 *
 * @returns The current effective target carried by the Candidate record.
 */
export const projectDurableCandidateTarget: CandidateTargetProjector = async ({ record }) => {
  const baseline = reduceCandidateDurableBaseline(record);
  return projectEffectiveCandidateTarget({
    record,
    current: baseline.target,
    currentBase: record.attestation.baseRevision,
    projectApplicability: async () => {
      throw new Error("A durable target must not request applicability.");
    },
  });
};

/** Project a deterministic changed-target applicability decision. */
export const projectCandidateApplicabilityDecision: CandidateTargetProjector = async ({ record }) => {
  const baseline = reduceCandidateDurableBaseline(record);
  const currentSubject = createCandidateSubjectSnapshot([{
    path: "packages/arc-framework/src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source: "changed" }),
    treatment: "reviewable",
  }]);
  const decision = classifyCandidateApplicability({
    candidateId: baseline.candidateId,
    baselineTarget: baseline.target,
    currentTarget: { revision: "b".repeat(40), subject: currentSubject },
    currentBase: "c".repeat(40),
  }, {
    endpoints: {
      before: {
        predecessor: { head: "1".repeat(40), tree: "2".repeat(40) },
        member: { head: baseline.target.revision, tree: "3".repeat(40) },
      },
      after: {
        predecessor: { head: "4".repeat(40), tree: "5".repeat(40) },
        member: { head: "b".repeat(40), tree: "6".repeat(40) },
      },
    },
    proof: {
      status: "refused",
      reason: "contribution-diverged",
      paths: ["packages/arc-framework/src/example.ts"],
    },
  });
  if (decision.state !== "decision-required") throw new Error("expected an applicability decision");
  return decision;
};
