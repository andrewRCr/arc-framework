/** Exact-bound review applicability selection over the canonical Candidate record. */

import { z } from "zod";
import { CanonicalDigestSchema } from "../../../lib/kernel/schema/vocabulary.js";

import { canonicalize } from "../../../lib/kernel/canonical/canonical-json.js";
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

const DigestSchema = CanonicalDigestSchema;

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

export const ReviewApplicabilityDecisionProjectionSchema = ReviewContributionApplicabilityResultSchema.refine(
  (projection) => projection.state === "decision-required",
  "review applicability selection requires an exact bounded residual",
);

export const ReviewApplicabilitySelectionOfferSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("review-applicability-selection"),
  workUnitId: z.string().trim().min(1),
  expectedRecordVersion: DigestSchema,
  candidateId: DigestSchema,
  projection: ReviewApplicabilityDecisionProjectionSchema,
  choices: z.tuple([z.literal("covered"), z.literal("review-required")]),
  interactionText: z.string().trim().min(1),
});
export type ReviewApplicabilitySelectionOffer = z.infer<
  typeof ReviewApplicabilitySelectionOfferSchema
>;

export const ReviewApplicabilitySelectionBatchOfferSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("review-applicability-selection-batch"),
  workUnitId: z.string().trim().min(1),
  expectedRecordVersion: DigestSchema,
  candidateId: DigestSchema,
  projections: z.array(ReviewApplicabilityDecisionProjectionSchema).min(2),
  choices: z.tuple([z.literal("covered"), z.literal("review-required")]),
  interactionText: z.string().trim().min(1),
});
export type ReviewApplicabilitySelectionBatchOffer = z.infer<
  typeof ReviewApplicabilitySelectionBatchOfferSchema
>;

const ReviewApplicabilitySelectionCommandSchema = z.strictObject({
  kind: z.literal("review-applicability-selection"),
  offer: ReviewApplicabilitySelectionOfferSchema,
  selection: z.strictObject({
    selectedBy: z.string().trim().min(1),
    selectedAt: z.iso.datetime({ offset: true }),
    choice: z.enum(["covered", "review-required"]),
  }),
});
const ReviewApplicabilitySelectionBatchCommandSchema = z.strictObject({
  kind: z.literal("review-applicability-selection-batch"),
  offer: ReviewApplicabilitySelectionBatchOfferSchema,
  selection: z.strictObject({
    selectedBy: z.string().trim().min(1),
    selectedAt: z.iso.datetime({ offset: true }),
    choice: z.enum(["covered", "review-required"]),
  }),
});
export const ReviewApplicabilityResolutionCommandInputSchema = z.union([
  ReviewApplicabilitySelectionCommandSchema,
  ReviewApplicabilitySelectionBatchCommandSchema,
]);
export type ReviewApplicabilityResolutionCommandInput = z.infer<
  typeof ReviewApplicabilityResolutionCommandInputSchema
>;

const ResultCommon = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-applicability-resolve"),
};
const ReviewApplicabilityRecordEffectSchema = z.strictObject({
  path: z.string().trim().min(1),
  // Direct UTF-8 record-byte hash owned by delivery record effects.
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
});
export const ReviewApplicabilityResolutionResultSchema = z.union([
  z.strictObject({
    ...ResultCommon,
    state: z.enum(["resolved", "exact-replay"]),
    nextAction: z.enum(["commit-selection", "continue", "request-review"]),
    candidateId: DigestSchema,
    choice: z.enum(["covered", "review-required"]),
    recordEffect: ReviewApplicabilityRecordEffectSchema.optional(),
  }).superRefine((value, context) => {
    const expected = value.choice === "covered"
      ? ["commit-selection", "continue"]
      : ["commit-selection", "request-review"];
    if (!expected.includes(value.nextAction)) {
      context.addIssue({ code: "custom", path: ["nextAction"], message: `must be ${expected.join(" or ")}` });
    }
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

/** Convert one status-owned offer plus the authority's choice without rebuilding its exact selector. */
export function reviewApplicabilityResolutionInputFromCommand(
  rawInput: ReviewApplicabilityResolutionCommandInput,
): ReviewApplicabilityResolutionInput {
  const input = ReviewApplicabilityResolutionCommandInputSchema.parse(rawInput);
  if (input.kind !== "review-applicability-selection") {
    throw new Error("A batch applicability command cannot be reduced to one selection.");
  }
  return ReviewApplicabilityResolutionInputSchema.parse({
    schemaVersion: 1,
    expectedRecordVersion: input.offer.expectedRecordVersion,
    candidateId: input.offer.candidateId,
    selector: input.offer.projection.selector,
    projectionDigest: input.offer.projection.projectionDigest,
    residualDigest: input.offer.projection.residualDigest,
    selectedBy: input.selection.selectedBy,
    selectedAt: input.selection.selectedAt,
    choice: input.selection.choice,
  });
}

/** Expand one attended singleton or batch answer into its exact Candidate selections. */
export function reviewApplicabilityResolutionInputsFromCommand(
  rawInput: ReviewApplicabilityResolutionCommandInput,
): readonly ReviewApplicabilityResolutionInput[] {
  const input = ReviewApplicabilityResolutionCommandInputSchema.parse(rawInput);
  const projections = input.kind === "review-applicability-selection"
    ? [input.offer.projection]
    : input.offer.projections;
  return projections.map((projection) => ReviewApplicabilityResolutionInputSchema.parse({
    schemaVersion: 1,
    expectedRecordVersion: input.offer.expectedRecordVersion,
    candidateId: input.offer.candidateId,
    selector: projection.selector,
    projectionDigest: projection.projectionDigest,
    residualDigest: projection.residualDigest,
    selectedBy: input.selection.selectedBy,
    selectedAt: input.selection.selectedAt,
    choice: input.selection.choice,
  }));
}

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

/** Re-derive and append one equivalent class through a single version-checked Candidate write. */
export async function resolveReviewApplicabilityBatch(
  context: ReviewApplicabilityResolutionContext,
  rawInputs: readonly ReviewApplicabilityResolutionInput[],
): Promise<ReviewApplicabilityResolutionResult> {
  const inputs = z.array(ReviewApplicabilityResolutionInputSchema).min(2).parse(rawInputs);
  const [first] = inputs;
  if (first === undefined) throw new Error("A review applicability batch requires projections.");
  if (inputs.some((input) => input.expectedRecordVersion !== first.expectedRecordVersion
    || input.candidateId !== first.candidateId
    || input.selectedBy !== first.selectedBy
    || input.selectedAt !== first.selectedAt
    || input.choice !== first.choice)) {
    return result({ state: "selection-conflict", nextAction: "stop" });
  }
  const requested = inputs.map(selection);
  if (requested.some((candidate, index) => requested.some((other, otherIndex) => (
    otherIndex !== index && sameAuthorityKey(candidate, other)
  )))) {
    return result({ state: "selection-conflict", nextAction: "stop" });
  }
  const versioned = await context.readRecord();
  if (versioned.record === null || versioned.version === null) {
    return result({
      state: "projection-failed",
      nextAction: "return-to-projection",
      reason: "candidate-unavailable",
      projection: null,
    });
  }
  if (versioned.record.attestation.candidateId !== first.candidateId) {
    return result({ state: "stale-bound-input", nextAction: "reclassify", reason: "candidate-id-changed" });
  }
  const recorded = candidateReviewApplicabilitySelections(versioned.record);
  const exactReplay = requested.map((candidate) => recorded.some(
    (existing) => canonicalize(existing) === canonicalize(candidate),
  ));
  if (requested.some((candidate, index) => !exactReplay[index]
    && recorded.some((existing) => sameAuthorityKey(existing, candidate)))) {
    return result({ state: "selection-conflict", nextAction: "stop" });
  }
  if (exactReplay.some((replay) => !replay) && versioned.version !== first.expectedRecordVersion) {
    return result({ state: "version-conflict", nextAction: "rerun" });
  }
  for (const input of inputs) {
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
  }
  if (exactReplay.every(Boolean)) {
    return result({
      state: "exact-replay",
      nextAction: first.choice === "covered" ? "continue" : "request-review",
      candidateId: first.candidateId,
      choice: first.choice,
    });
  }
  const missing = requested.filter((_candidate, index) => !exactReplay[index]);
  const nextRecord = CandidateManagedRecordV1Schema.parse({
    ...versioned.record,
    transitions: [...versioned.record.transitions, ...missing],
  });
  if (await context.writeRecord(nextRecord, first.expectedRecordVersion) === "version-conflict") {
    return result({ state: "version-conflict", nextAction: "rerun" });
  }
  return result({
    state: "resolved",
    nextAction: first.choice === "covered" ? "continue" : "request-review",
    candidateId: first.candidateId,
    choice: first.choice,
  });
}
