/** Exact-bound review applicability selection over the canonical Candidate record. */

import { z } from "zod";

import { canonicalize } from "../../../lib/canonical/canonical-json.js";
import {
  CandidateManagedRecordV1Schema,
  CandidateReviewApplicabilitySelectionV1Schema,
  candidateReviewApplicabilitySelections,
  type CandidateManagedRecordV1,
  type CandidateReviewApplicabilitySelectionV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import type { VersionedCandidateRecord } from "../../../lib/work-unit/candidate-record-store.js";
import { ReviewContributionApplicabilitySelectorSchema } from
  "../../../lib/work-unit/review-applicability-selector.js";
import {
  ReviewContributionApplicabilityResultSchema,
  type ReviewContributionApplicabilityResult,
} from "./review-contribution-applicability.js";

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const ReviewApplicabilityResolutionInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expectedRecordVersion: DigestSchema,
  candidateId: DigestSchema,
  selector: ReviewContributionApplicabilitySelectorSchema,
  projectionDigest: DigestSchema,
  residualDigest: DigestSchema,
  selectedBy: z.string().trim().min(1),
  selectedAt: z.iso.datetime({ offset: true }),
  choice: z.enum(["covered", "review-required"]),
});
export type ReviewApplicabilityResolutionInput = z.infer<
  typeof ReviewApplicabilityResolutionInputSchema
>;

const ResultCommon = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-applicability-resolve"),
};
export const ReviewApplicabilityResolutionResultSchema = z.union([
  z.strictObject({
    ...ResultCommon,
    state: z.enum(["resolved", "exact-replay"]),
    nextAction: z.enum(["continue", "request-review"]),
    candidateId: DigestSchema,
    choice: z.enum(["covered", "review-required"]),
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("stale-bound-input"),
    nextAction: z.literal("reclassify"),
    reason: z.enum(["candidate-id-changed", "selector-changed", "projection-changed", "residual-changed"]),
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("version-conflict"),
    nextAction: z.literal("rerun"),
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("selection-conflict"),
    nextAction: z.literal("stop"),
  }),
  z.strictObject({
    ...ResultCommon,
    state: z.literal("projection-failed"),
    nextAction: z.literal("return-to-projection"),
    reason: z.enum(["candidate-unavailable", "execution-unavailable", "decision-no-longer-required"]),
    projection: ReviewContributionApplicabilityResultSchema.nullable(),
  }),
]);
export type ReviewApplicabilityResolutionResult = z.infer<
  typeof ReviewApplicabilityResolutionResultSchema
>;

export interface ReviewApplicabilityResolutionContext {
  readonly readRecord: () => Promise<VersionedCandidateRecord>;
  readonly projectApplicability: (
    selector: ReviewApplicabilityResolutionInput["selector"],
  ) => Promise<ReviewContributionApplicabilityResult>;
  readonly writeRecord: (
    record: CandidateManagedRecordV1,
    expectedVersion: string,
  ) => Promise<"written" | "version-conflict">;
}

function selection(input: ReviewApplicabilityResolutionInput): CandidateReviewApplicabilitySelectionV1 {
  return CandidateReviewApplicabilitySelectionV1Schema.parse({
    transitionKind: "review-applicability-selection",
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    candidateId: input.candidateId,
    selector: input.selector,
    projectionDigest: input.projectionDigest,
    residualDigest: input.residualDigest,
    selectedBy: input.selectedBy,
    selectedAt: input.selectedAt,
    choice: input.choice,
  });
}

function result(value: Record<string, unknown>): ReviewApplicabilityResolutionResult {
  return ReviewApplicabilityResolutionResultSchema.parse({
    schemaVersion: 1,
    mode: "review-applicability-resolve",
    ...value,
  });
}

function sameAuthorityKey(
  left: CandidateReviewApplicabilitySelectionV1,
  right: CandidateReviewApplicabilitySelectionV1,
): boolean {
  return left.candidateId === right.candidateId
    && canonicalize(left.selector) === canonicalize(right.selector)
    && left.projectionDigest === right.projectionDigest
    && left.residualDigest === right.residualDigest;
}

/** Re-derive and append one target-neutral review authority selection by exact version check. */
export async function resolveReviewApplicability(
  context: ReviewApplicabilityResolutionContext,
  rawInput: ReviewApplicabilityResolutionInput,
): Promise<ReviewApplicabilityResolutionResult> {
  const input = ReviewApplicabilityResolutionInputSchema.parse(rawInput);
  const versioned = await context.readRecord();
  if (versioned.record === null || versioned.version === null) {
    return result({
      state: "projection-failed",
      nextAction: "return-to-projection",
      reason: "candidate-unavailable",
      projection: null,
    });
  }
  if (versioned.record.attestation.candidateId !== input.candidateId) {
    return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "candidate-id-changed" });
  }
  const requested = selection(input);
  const recorded = candidateReviewApplicabilitySelections(versioned.record);
  const exactReplay = recorded.some((candidate) => canonicalize(candidate) === canonicalize(requested));
  if (!exactReplay && recorded.some((candidate) => sameAuthorityKey(candidate, requested))) {
    return result({ state: "selection-conflict", nextAction: "stop" });
  }
  if (!exactReplay && versioned.version !== input.expectedRecordVersion) {
    return result({ state: "version-conflict", nextAction: "rerun" });
  }
  let projection: ReviewContributionApplicabilityResult;
  try {
    projection = ReviewContributionApplicabilityResultSchema.parse(
      await context.projectApplicability(input.selector),
    );
  } catch {
    return result({
      state: "projection-failed",
      nextAction: "return-to-projection",
      reason: "execution-unavailable",
      projection: null,
    });
  }
  if (canonicalize(projection.selector) !== canonicalize(input.selector)) {
    return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "selector-changed" });
  }
  if (projection.state !== "decision-required") {
    return result({
      state: "projection-failed",
      nextAction: "return-to-projection",
      reason: "decision-no-longer-required",
      projection,
    });
  }
  if (projection.projectionDigest !== input.projectionDigest) {
    return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "projection-changed" });
  }
  if (projection.residualDigest !== input.residualDigest) {
    return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "residual-changed" });
  }
  if (exactReplay) {
    return result({
      state: "exact-replay",
      nextAction: input.choice === "covered" ? "continue" : "request-review",
      candidateId: input.candidateId,
      choice: input.choice,
    });
  }
  const nextRecord = CandidateManagedRecordV1Schema.parse({
    ...versioned.record,
    transitions: [...versioned.record.transitions, requested],
  });
  if (await context.writeRecord(nextRecord, input.expectedRecordVersion) === "version-conflict") {
    return result({ state: "version-conflict", nextAction: "rerun" });
  }
  return result({
    state: "resolved",
    nextAction: input.choice === "covered" ? "continue" : "request-review",
    candidateId: input.candidateId,
    choice: input.choice,
  });
}
