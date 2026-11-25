/** Shared Candidate projections for tests that exercise durable recorded state. */

import { canonicalDigest } from "../../src/lib/kernel/canonical/canonical-json.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  reduceCandidateDurableBaseline,
  type CandidateLineageTarget,
  type CandidateManagedRecordV1,
} from "../../src/lib/work-unit/candidate-attestation.js";
import {
  classifyCandidateApplicability,
  type CandidateApplicabilityDecisionResult,
} from "../../src/lib/work-unit/candidate-applicability.js";
import {
  CandidateApplicabilityDecisionSelectionSchema,
  composeCandidateApplicabilityResolutionSelector,
  type CandidateApplicabilityDecisionSelection,
} from "../../src/lib/work-unit/candidate-applicability-resolution.js";
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

function changedTargetDecision(record: CandidateManagedRecordV1): {
  decision: CandidateApplicabilityDecisionResult;
  currentTarget: CandidateLineageTarget;
} {
  const baseline = reduceCandidateDurableBaseline(record);
  const currentSubject = createCandidateSubjectSnapshot([{
    path: "packages/arc-framework/src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source: "changed" }),
    treatment: "reviewable",
  }]);
  const currentTarget = { revision: "b".repeat(40), subject: currentSubject };
  const decision = classifyCandidateApplicability({
    candidateId: baseline.candidateId,
    baselineTarget: baseline.target,
    currentTarget,
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
  return { decision, currentTarget };
}

/** Project a deterministic changed-target applicability decision. */
export const projectCandidateApplicabilityDecision: CandidateTargetProjector = async ({ record }) =>
  changedTargetDecision(record).decision;

/**
 * Compose a deterministic bounded decision over a root Candidate, with the exact selector it binds.
 *
 * @returns The record and version the decision was read against, the decision, its collected current target, and
 *   the decision carrying its resolution selector.
 */
export function candidateDecisionSelectionFixture(): {
  record: CandidateManagedRecordV1;
  recordVersion: string;
  decision: CandidateApplicabilityDecisionResult;
  currentTarget: CandidateLineageTarget;
  selection: CandidateApplicabilityDecisionSelection;
} {
  const subject = createCandidateSubjectSnapshot([{
    path: "packages/arc-framework/src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source: "root" }),
    treatment: "reviewable",
  }]);
  const record: CandidateManagedRecordV1 = {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit: "example",
      subject,
      baseRevision: "a".repeat(40),
      attestedBy: "andrew",
      attestedAt: "2026-11-03T12:00:00.000Z",
      verificationEvidenceRef: "verification://root",
    }),
    subject,
    transitions: [],
    lineageAttestations: [],
  };
  const recordVersion = canonicalDigest({ record: "version" });
  const { decision, currentTarget } = changedTargetDecision(record);
  const composed = composeCandidateApplicabilityResolutionSelector({ record, recordVersion, decision, currentTarget });
  if (composed.status !== "composed") throw new Error("expected a resolution selector");
  return {
    record,
    recordVersion,
    decision,
    currentTarget,
    selection: CandidateApplicabilityDecisionSelectionSchema.parse({
      ...decision,
      resolutionSelector: composed.selector,
    }),
  };
}
