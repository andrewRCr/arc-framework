/** Shared Candidate target projection over durable authority transitions and ephemeral Git facts. */

import type {
  CandidateApplicabilityRequest,
  CandidateApplicabilityResult,
} from "./candidate-applicability.js";
import {
  CandidateLineageTargetSchema,
  projectCandidateCurrentness,
  reduceCandidateDurableBaseline,
  type CandidateLineageTarget,
  type CandidateManagedRecordV1,
} from "./candidate-attestation.js";

type NonApplicableProjection = Exclude<CandidateApplicabilityResult, { state: "applicable" }>;

export interface CandidateEffectiveCurrentProjection {
  readonly schemaVersion: 1;
  readonly mode: "candidate-effective-target";
  readonly state: "current";
  readonly nextAction: "continue";
  readonly candidateId: string;
  readonly durableBaselineTarget: CandidateLineageTarget;
  readonly recognizedTarget: CandidateLineageTarget;
  readonly recognition:
    | { readonly kind: "durable" }
    | {
        readonly kind: "machine";
        readonly proof: "subject-equality" | "tree-equality" | "mechanical-reapply";
        readonly projectionDigest: string;
        readonly residualDigest: string;
      };
  readonly implementationChanged: boolean;
  readonly convergenceVerification: "satisfied" | "pending";
}

export interface CandidateEffectiveChangedProjection {
  readonly schemaVersion: 1;
  readonly mode: "candidate-effective-target";
  readonly state: "changed";
  readonly nextAction: "establish-new-root";
  readonly candidateId: string;
  readonly durableBaselineTarget: CandidateLineageTarget;
  readonly currentTarget: CandidateLineageTarget;
  readonly projectionDigest: string;
  readonly residualDigest: string;
  readonly selectedBy: string;
}

export type CandidateEffectiveTargetProjection =
  | CandidateEffectiveCurrentProjection
  | CandidateEffectiveChangedProjection
  | NonApplicableProjection;

export interface CandidateEffectiveTargetInput {
  readonly record: CandidateManagedRecordV1;
  readonly current: CandidateLineageTarget;
  readonly currentBase: string;
  readonly projectApplicability: (
    request: CandidateApplicabilityRequest,
  ) => Promise<CandidateApplicabilityResult>;
}

function exactTarget(left: CandidateLineageTarget, right: CandidateLineageTarget): boolean {
  return left.revision === right.revision
    && left.subject.subjectDigest === right.subject.subjectDigest;
}

/** Project one Candidate's effective recognized target without persisting machine equivalence. */
export async function projectEffectiveCandidateTarget(
  input: CandidateEffectiveTargetInput,
): Promise<CandidateEffectiveTargetProjection> {
  const current = CandidateLineageTargetSchema.parse(input.current);
  const baseline = reduceCandidateDurableBaseline(input.record);
  const durableCurrentness = projectCandidateCurrentness({ record: input.record, current });
  if (durableCurrentness.status === "current") {
    return {
      schemaVersion: 1,
      mode: "candidate-effective-target",
      state: "current",
      nextAction: "continue",
      candidateId: baseline.candidateId,
      durableBaselineTarget: baseline.target,
      recognizedTarget: current,
      recognition: { kind: "durable" },
      implementationChanged: durableCurrentness.implementationChanged,
      convergenceVerification: durableCurrentness.convergenceVerification,
    };
  }

  const applicability = await input.projectApplicability({
    candidateId: baseline.candidateId,
    baselineTarget: baseline.target,
    currentTarget: current,
    currentBase: input.currentBase,
  });
  if (applicability.state === "applicable") {
    const baselineCurrentness = projectCandidateCurrentness({
      record: input.record,
      current: baseline.target,
    });
    if (baselineCurrentness.status !== "current") {
      throw new Error("Candidate durable baseline did not reduce to a current target");
    }
    return {
      schemaVersion: 1,
      mode: "candidate-effective-target",
      state: "current",
      nextAction: "continue",
      candidateId: baseline.candidateId,
      durableBaselineTarget: baseline.target,
      recognizedTarget: current,
      recognition: {
        kind: "machine",
        proof: applicability.proof,
        projectionDigest: applicability.projectionDigest,
        residualDigest: applicability.residualDigest,
      },
      implementationChanged: baselineCurrentness.implementationChanged,
      convergenceVerification: baselineCurrentness.convergenceVerification,
    };
  }

  const selected = baseline.selectedChange;
  if (applicability.state === "decision-required"
    && selected !== null
    && selected.candidateId === applicability.candidateId
    && exactTarget(selected.priorTarget, baseline.target)
    && exactTarget(selected.currentTarget, current)
    && selected.projectionDigest === applicability.projectionDigest
    && selected.residualDigest === applicability.residualDigest) {
    return {
      schemaVersion: 1,
      mode: "candidate-effective-target",
      state: "changed",
      nextAction: "establish-new-root",
      candidateId: baseline.candidateId,
      durableBaselineTarget: baseline.target,
      currentTarget: current,
      projectionDigest: selected.projectionDigest,
      residualDigest: selected.residualDigest,
      selectedBy: selected.selectedBy,
    };
  }
  return applicability;
}
