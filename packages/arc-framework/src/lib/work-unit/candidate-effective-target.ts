/** Shared Candidate target projection over durable authority transitions and ephemeral Git facts. */

import type {
  CandidateApplicabilityRequest,
  CandidateApplicabilityResult,
} from "./candidate-applicability.js";
import {
  CandidateLineageTargetSchema,
  CandidateConvergenceProjectionSchema,
  diffCandidateSubjectSnapshots,
  projectCandidateCurrentness,
  reduceCandidateDurableBaseline,
  type CandidateCurrentnessProjection,
  type CandidateConvergenceProjection,
  type CandidateLineageTarget,
  type CandidateManagedRecordV1,
} from "./candidate-attestation.js";

export type NonApplicableProjection = Exclude<CandidateApplicabilityResult, { state: "applicable" }>;

export type CandidateEffectiveCurrentProjection = {
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
} & CandidateConvergenceProjection;

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

export interface CandidateEffectiveStagedChangeProjection {
  readonly schemaVersion: 1;
  readonly mode: "candidate-effective-target";
  readonly state: "staged-change";
  readonly nextAction: "establish-new-root";
  readonly candidateId: string;
  readonly durableBaselineTarget: CandidateLineageTarget;
  readonly currentTarget: CandidateLineageTarget;
}

export type CandidateEffectiveTargetProjection =
  | CandidateEffectiveCurrentProjection
  | CandidateEffectiveChangedProjection
  | CandidateEffectiveStagedChangeProjection
  | NonApplicableProjection;

export interface CandidateTargetProjectorInput {
  readonly cwd: string;
  readonly name: string;
  readonly record: CandidateManagedRecordV1;
}

export type CandidateTargetProjector = (
  input: CandidateTargetProjectorInput,
) => Promise<CandidateEffectiveTargetProjection>;

export type CandidateEffectiveCurrentnessProjection =
  | CandidateCurrentnessProjection
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
    const convergence = CandidateConvergenceProjectionSchema.parse({
      convergenceVerification: durableCurrentness.convergenceVerification,
      convergenceScope: durableCurrentness.convergenceScope,
    });
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
      ...convergence,
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
    const convergence = CandidateConvergenceProjectionSchema.parse({
      convergenceVerification: baselineCurrentness.convergenceVerification,
      convergenceScope: baselineCurrentness.convergenceScope,
    });
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
      ...convergence,
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

/** Adapt the effective target to legacy current/changed policy while preserving typed applicability outcomes. */
export function projectEffectiveCandidateCurrentness(
  input: CandidateEffectiveTargetProjection,
): CandidateEffectiveCurrentnessProjection {
  if (input.state === "current") {
    const convergence = CandidateConvergenceProjectionSchema.parse({
      convergenceVerification: input.convergenceVerification,
      convergenceScope: input.convergenceScope,
    });
    return {
      status: "current",
      candidateId: input.candidateId,
      recognizedRevision: input.recognizedTarget.revision,
      implementationChanged: input.implementationChanged,
      ...convergence,
    };
  }
  if (input.state === "changed" || input.state === "staged-change") {
    return {
      status: "blocked",
      candidateId: input.candidateId,
      recognizedRevision: input.durableBaselineTarget.revision,
      currentRevision: input.currentTarget.revision,
      delta: diffCandidateSubjectSnapshots(
        input.durableBaselineTarget.subject,
        input.currentTarget.subject,
      ),
      nextAction: "Run full work-unit verification to establish a new Candidate lineage root.",
    };
  }
  return input;
}

/** Compare a staged attestation subject through the committed effective target without masking staged changes. */
export function projectStagedCandidateCurrentness(input: {
  readonly record: CandidateManagedRecordV1;
  readonly staged: CandidateLineageTarget;
  readonly committed: CandidateEffectiveTargetProjection;
}): CandidateCurrentnessProjection {
  const staged = CandidateLineageTargetSchema.parse(input.staged);
  if (input.committed.state === "current"
    && input.committed.recognizedTarget.subject.subjectDigest === staged.subject.subjectDigest) {
    const convergence = CandidateConvergenceProjectionSchema.parse({
      convergenceVerification: input.committed.convergenceVerification,
      convergenceScope: input.committed.convergenceScope,
    });
    return {
      status: "current",
      candidateId: input.committed.candidateId,
      recognizedRevision: staged.revision,
      implementationChanged: input.committed.implementationChanged,
      ...convergence,
    };
  }
  return projectCandidateCurrentness({ record: input.record, current: staged });
}
