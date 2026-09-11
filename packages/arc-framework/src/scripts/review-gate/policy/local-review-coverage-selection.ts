/** Typed local coverage recovery derived from immutable predecessor evidence. */

import { canonicalize } from "../../../lib/kernel/index.js";

import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import {
  LocalReviewCoverageSelectionActionSchema,
  type LocalReviewCoverageAdmission,
  type LocalReviewCoverageSelectionAction,
} from "../core/local-review-coverage.js";
import type {
  ApprovedDispositionRecordStore,
  ReviewResultReader,
} from "../core/ports.js";
import { buildIncrementalCorrectionScope } from "./incremental-coverage-basis.js";
import {
  readIncrementalPredecessorResponseEvidence,
} from "./review-policy-evidence.js";
import type { ReviewResolveEnvelope } from "./review-policy-driver.js";
import type { StandardReviewObligationProjection } from
  "./standard-review-projection-schema.js";

export type LocalReviewCoverageSelectionResolution =
  | { readonly state: "ready"; readonly coverageSelected: boolean }
  | {
      readonly state: "coverage-required";
      readonly action: LocalReviewCoverageSelectionAction;
    };

/**
 * Resolve an optional local coverage selection against current immutable predecessor evidence.
 *
 * @param input - Current policy result, local target, and optional caller-returned coverage choice.
 * @param dependencies - Immutable result and approved-response readers.
 * @returns A typed selection action, or a validated signal that policy may admit the operation.
 */
export async function resolveLocalReviewCoverageSelection(input: {
  readonly policy: ReviewResolveEnvelope;
  readonly target: ReviewTarget;
  readonly sourceId: string;
  readonly lineage: LaneSubjectLineage;
  readonly standardReview: StandardReviewObligationProjection;
  readonly predecessorOperationId?: string;
  readonly coverageAdmission?: LocalReviewCoverageAdmission;
}, dependencies: {
  readonly resultReader: ReviewResultReader;
  readonly dispositionStore: ApprovedDispositionRecordStore;
}): Promise<LocalReviewCoverageSelectionResolution> {
  if (input.policy.state !== "coverage-required" && input.policy.state !== "ready") {
    if (input.coverageAdmission?.requestedCoverage === "incremental") {
      throw new Error("Incremental local review coverage requires a current correction selection.");
    }
    return { state: "ready", coverageSelected: false };
  }

  const terminal = input.policy.payload.attemptedSources.at(-1);
  const predecessorOperationId = input.policy.state === "coverage-required"
    && terminal !== undefined
    && "reviewOperationId" in terminal
    ? terminal.reviewOperationId
    : input.predecessorOperationId;
  const completedPasses = input.policy.state === "coverage-required"
    ? input.policy.payload.completedPasses
    : input.policy.payload.pass - 1;
  if (predecessorOperationId === undefined) {
    if (input.coverageAdmission?.requestedCoverage === "incremental") {
      throw new Error("Incremental local review coverage requires a current correction selection.");
    }
    return { state: "ready", coverageSelected: false };
  }
  let correctionScope = null;
  {
    const predecessor = await dependencies.resultReader.readResult(predecessorOperationId)
      .catch(() => null);
    if (predecessor !== null
      && predecessor.kind !== "frontline"
      && predecessor.repositoryId === input.target.repositoryId
      && predecessor.admission.logicalPass === completedPasses
      && canonicalize(predecessor.admission.lineage) === canonicalize(input.lineage)
      && canonicalize({
        obligation: predecessor.requirement.obligation,
        reasons: [...predecessor.requirement.reasons].sort(),
        rubricVersion: predecessor.requirement.rubricVersion,
        rubricDigest: predecessor.requirement.rubricDigest,
        retrigger: predecessor.requirement.retrigger,
        count: predecessor.requirement.count,
      }) === canonicalize({
        ...input.standardReview,
        reasons: [...input.standardReview.reasons].sort(),
      })) {
      const response = await readIncrementalPredecessorResponseEvidence(
        predecessor,
        dependencies.dispositionStore,
      ).catch(() => null);
      correctionScope = response === null ? null : buildIncrementalCorrectionScope({
        predecessor,
        currentHeadSha: input.target.headSha,
        response,
      });
    }
  }
  const choices: LocalReviewCoverageAdmission[] = [
    ...(correctionScope === null
      ? []
      : [{ requestedCoverage: "incremental" as const, correctionScope }]),
    { requestedCoverage: "complete" },
  ];
  const action = LocalReviewCoverageSelectionActionSchema.parse({
    schemaVersion: 1,
    kind: "local-review-coverage-selection",
    sourceId: input.sourceId,
    target: input.target,
    pass: input.policy.payload.pass,
    completedPasses,
    consumedPass: true,
    choices,
    interactionText: "Select one listed coverage admission and re-run `arc review local prepare` with it.",
  });
  if (input.coverageAdmission === undefined) return { state: "coverage-required", action };
  if (!choices.some((choice) => canonicalize(choice) === canonicalize(input.coverageAdmission))) {
    throw new Error("Local review coverage selection does not match a current offered choice.");
  }
  return {
    state: "ready",
    coverageSelected: input.policy.state === "coverage-required",
  };
}
