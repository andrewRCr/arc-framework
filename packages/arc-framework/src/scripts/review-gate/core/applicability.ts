/** Canonical applicability proofs for carry-forward and interaction-only retriggers. */

import { z } from "zod";

import { affectedPaths } from "../../../lib/change-facts.js";
import { ChangeSetSchema } from "../../../lib/change-facts.schema.js";
import {
  canonicalDigest,
  canonicalize,
  sortByCanonicalBytes,
  type KernelRegistry,
} from "../../../lib/kernel/index.js";
import {
  ReviewCanonicalDigestSchema,
  type ReviewReceiptV2,
} from "./gate-contract-v2-schema.js";

const ReviewPathSchema = z.string().min(1).refine((path) => !path.includes("\0"), {
  message: "review paths must be NUL-free",
});

function isSortedUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
    && sortByCanonicalBytes(values).every((value, index) => value === values[index]);
}

const ApplicabilityFieldsObjectSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-gate/v2"),
  priorTargetId: ReviewCanonicalDigestSchema,
  currentTargetId: ReviewCanonicalDigestSchema,
  changeSetId: ReviewCanonicalDigestSchema,
  reviewedPaths: z.array(ReviewPathSchema).min(1),
  deltaPaths: z.array(ReviewPathSchema).min(1),
  interactionPaths: z.array(ReviewPathSchema),
  conflictState: z.enum(["none", "resolved"]),
  treatment: z.enum(["carry", "incremental"]),
});

type ApplicabilityFields = z.infer<typeof ApplicabilityFieldsObjectSchema>;

function checkApplicabilityFields(proof: ApplicabilityFields, context: z.core.$RefinementCtx): void {
  if (!isSortedUnique(proof.reviewedPaths)
    || !isSortedUnique(proof.deltaPaths)
    || !isSortedUnique(proof.interactionPaths)) {
    context.addIssue({ code: "custom", message: "applicability path manifests must be sorted and unique" });
  }
  const delta = new Set(proof.deltaPaths);
  const exactInteraction = normalizedPaths(proof.reviewedPaths.filter((path) => delta.has(path)));
  if (canonicalize(exactInteraction) !== canonicalize(proof.interactionPaths)) {
    context.addIssue({ code: "custom", message: "interaction paths must be the exact reviewed/delta intersection" });
  }
  const treatment = proof.conflictState === "resolved"
    ? "incremental"
    : proof.interactionPaths.length === 0 ? "carry" : "incremental";
  if (proof.treatment !== treatment) {
    context.addIssue({ code: "custom", message: "applicability treatment must follow conflict and interaction state" });
  }
}

const ApplicabilityFieldsSchema = ApplicabilityFieldsObjectSchema.superRefine(checkApplicabilityFields);

export const ReviewApplicabilityIdPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-gate.applicability-id/v2"),
  ...ApplicabilityFieldsObjectSchema.shape,
}).superRefine(checkApplicabilityFields);

export const ReviewApplicabilityProofSchema = z.strictObject({
  ...ApplicabilityFieldsObjectSchema.shape,
  applicabilityId: ReviewCanonicalDigestSchema,
}).superRefine(checkApplicabilityFields);
export type ReviewApplicabilityProof = z.infer<typeof ReviewApplicabilityProofSchema>;

const ReviewApplicabilityClassificationInputSchema = z.strictObject({
  priorTargetId: ReviewCanonicalDigestSchema,
  currentTargetId: ReviewCanonicalDigestSchema,
  changeSetId: ReviewCanonicalDigestSchema,
  reviewedPaths: z.array(ReviewPathSchema).min(1),
  changeSet: ChangeSetSchema,
  conflictState: z.enum(["none", "resolved"]),
});
export type ReviewApplicabilityClassificationInput = z.infer<
  typeof ReviewApplicabilityClassificationInputSchema
>;

function normalizedPaths(paths: readonly string[]): string[] {
  const validated = paths.map((path) => ReviewPathSchema.parse(path));
  return sortByCanonicalBytes([...new Set(validated)]);
}

function preimage(fields: z.infer<typeof ApplicabilityFieldsSchema>) {
  return ReviewApplicabilityIdPreimageSchema.parse({
    domain: "arc.review-gate.applicability-id/v2",
    ...fields,
  });
}

/** Derive an exact applicability proof from canonical change facts. */
export function classifyReviewApplicability(
  input: ReviewApplicabilityClassificationInput,
): ReviewApplicabilityProof {
  const parsed = ReviewApplicabilityClassificationInputSchema.parse(input);
  if (parsed.changeSet.changeSet === "unknown") {
    throw new Error("unknown change sets cannot establish review applicability");
  }
  const reviewedPaths = normalizedPaths(parsed.reviewedPaths);
  const deltaPaths = normalizedPaths(affectedPaths(parsed.changeSet.changes));
  const delta = new Set(deltaPaths);
  const interactionPaths = reviewedPaths.filter((path) => delta.has(path));
  const treatment = parsed.conflictState === "resolved" || interactionPaths.length > 0
    ? "incremental"
    : "carry";
  const fields = ApplicabilityFieldsSchema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    priorTargetId: parsed.priorTargetId,
    currentTargetId: parsed.currentTargetId,
    changeSetId: parsed.changeSetId,
    reviewedPaths,
    deltaPaths,
    interactionPaths,
    conflictState: parsed.conflictState,
    treatment,
  });
  return validateReviewApplicabilityProof({
    ...fields,
    applicabilityId: canonicalDigest(preimage(fields)),
  });
}

/** Validate structure, normalized path sets, and the canonical applicability identity. */
export function validateReviewApplicabilityProof(input: unknown): ReviewApplicabilityProof {
  const proof = ReviewApplicabilityProofSchema.parse(input);
  const { applicabilityId, ...fields } = proof;
  const normalized = ApplicabilityFieldsSchema.parse(fields);
  if (canonicalDigest(preimage(normalized)) !== applicabilityId) {
    throw new Error("review applicability ID does not match its preimage");
  }
  return proof;
}

/** Check that an incremental receipt covers the exact interaction or the complete stronger delta. */
export function validateIncrementalApplicabilityReceipt(
  proofInput: unknown,
  receipt: ReviewReceiptV2,
  coveragePaths: readonly string[],
): boolean {
  let proof: ReviewApplicabilityProof;
  try {
    proof = validateReviewApplicabilityProof(proofInput);
  } catch {
    return false;
  }
  if (proof.treatment !== "incremental" || receipt.applicabilityId !== proof.applicabilityId) return false;
  const coverage = normalizedPaths(coveragePaths);
  const coverageKey = canonicalize(coverage);
  return (proof.interactionPaths.length > 0 && coverageKey === canonicalize(proof.interactionPaths))
    || coverageKey === canonicalize(proof.deltaPaths);
}

/** Register applicability proof and ID-preimage schemas. */
export function registerReviewApplicabilitySchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewApplicabilityIdPreimageSchema, {
    id: "review-applicability-id-preimage",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewApplicabilityProofSchema, {
    id: "review-applicability",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
