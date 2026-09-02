/** Shared Candidate projections for tests that exercise durable recorded state. */

import { reduceCandidateDurableBaseline } from "../../src/lib/work-unit/candidate-attestation.js";
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
