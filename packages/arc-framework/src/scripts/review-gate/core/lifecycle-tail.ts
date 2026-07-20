/** Storage-neutral lifecycle-tail proof and applicability reduction. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { validateReviewTarget } from "./gate-contract-v2.js";
import {
  GitObjectIdSchema,
  ReviewCanonicalDigestSchema,
  type ReviewTarget,
} from "./gate-contract-v2-schema.js";

/** Stable diagnostics emitted when a lifecycle-tail bridge cannot be trusted. */
export type LifecycleTailDiagnostic =
  | "invalid-predicate"
  | "invalid-identity"
  | "base-ref-drift"
  | "diff-base-drift"
  | "policy-version-drift"
  | "rubric-version-drift"
  | "rubric-digest-drift"
  | "source-identity-drift"
  | "target-scope-drift"
  | "surface-tree-drift"
  | "path-manifest-drift"
  | "semantic-digest-drift"
  | "ambiguous-artifact-group"
  | "invalid-artifact-group"
  | "unrecognized-tail-change"
  | "tail-unavailable";

const LifecycleTailDiagnosticSchema = z.enum([
  "invalid-predicate",
  "invalid-identity",
  "base-ref-drift",
  "diff-base-drift",
  "policy-version-drift",
  "rubric-version-drift",
  "rubric-digest-drift",
  "source-identity-drift",
  "target-scope-drift",
  "surface-tree-drift",
  "path-manifest-drift",
  "semantic-digest-drift",
  "ambiguous-artifact-group",
  "invalid-artifact-group",
  "unrecognized-tail-change",
  "tail-unavailable",
]);

const LifecycleTailArtifactIdentitySchema = z.strictObject({
  workUnitId: z.string(),
  artifactGroupId: z.string(),
  cohortPath: z.string().min(1).nullable(),
});

export const ForwardLifecycleSurfaceSchema = z.strictObject({
  treeId: GitObjectIdSchema,
  pathManifestDigest: ReviewCanonicalDigestSchema,
  semanticDigest: ReviewCanonicalDigestSchema,
});
export type ForwardLifecycleSurface = z.infer<typeof ForwardLifecycleSurfaceSchema>;

export const ForwardLifecycleTailProofSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-gate/v2"),
  predicateId: z.literal("lifecycle-bookkeeping-tail/v2"),
  priorTargetId: ReviewCanonicalDigestSchema,
  currentTargetId: ReviewCanonicalDigestSchema,
  priorHeadTree: GitObjectIdSchema,
  currentHeadTree: GitObjectIdSchema,
  reviewedSurface: ForwardLifecycleSurfaceSchema,
  currentSurface: ForwardLifecycleSurfaceSchema,
  policyVersion: ReviewCanonicalDigestSchema,
  rubricVersion: z.string().min(1),
  rubricDigest: ReviewCanonicalDigestSchema,
  sourceIdentity: z.string().min(1),
  artifact: LifecycleTailArtifactIdentitySchema,
  applicability: z.strictObject({
    treatment: z.literal("carry"),
    scope: z.literal("review-coverage-only"),
  }),
  diagnostics: z.array(LifecycleTailDiagnosticSchema),
}).refine((proof) => proof.diagnostics.length > 0
  || (proof.artifact.workUnitId.length > 0 && proof.artifact.artifactGroupId.length > 0), {
  message: "trusted lifecycle-tail proofs require an artifact identity",
});
export type ForwardLifecycleTailProof = z.infer<typeof ForwardLifecycleTailProofSchema>;

/** Inputs used to construct one exact forward lifecycle-tail proof. */
export interface ForwardLifecycleTailProofInput {
  predicateId: "lifecycle-bookkeeping-tail/v2";
  priorTarget: ReviewTarget;
  currentTarget: ReviewTarget;
  reviewedSurface: ForwardLifecycleSurface;
  currentSurface: ForwardLifecycleSurface;
  policyVersion: `sha256:${string}`;
  rubricVersion: string;
  rubricDigest: `sha256:${string}`;
  sourceIdentity: string;
  artifact: LifecycleTailArtifactIdentity;
  diagnostics: LifecycleTailDiagnostic[];
}

/** Inputs that establish whether a forward tail proof applies to current review coverage. */
export interface ForwardLifecycleTailApplicabilityInput {
  proof: ForwardLifecycleTailProof | null;
  priorTarget: ReviewTarget;
  currentTarget: ReviewTarget;
  policyVersion: string;
  rubricVersion: string;
  rubricDigest: string;
  sourceIdentity: string;
}

/** Opaque work-unit identity retained by a storage-specific proof producer. */
export interface LifecycleTailArtifactIdentity {
  workUnitId: string;
  artifactGroupId: string;
  cohortPath: string | null;
}

/**
 * A storage-specific classification that an exact post-review tail is not review-relevant.
 * It is deliberately not review evidence and cannot carry a source result or finding closure.
 */
export interface LifecycleTailProof {
  schemaVersion: 1;
  predicateId: string;
  reviewedThroughSha: string;
  currentHeadSha: string;
  baseRef: string;
  diffBaseSha: string;
  policyVersion: string;
  rubricVersion: string;
  sourceIdentity: string;
  artifact: LifecycleTailArtifactIdentity;
  diagnostics: LifecycleTailDiagnostic[];
}

/** Runtime proof shape before the supported schema version is established. */
export type LifecycleTailProofCandidate = Omit<LifecycleTailProof, "schemaVersion"> & { schemaVersion: number };

/** Exact requirement and evidence identity a proof must bridge. */
export interface LifecycleTailApplicabilityInput {
  proof: LifecycleTailProofCandidate | null;
  predicateId: string;
  reviewedThroughSha: string;
  currentHeadSha: string;
  baseRef: string;
  diffBaseSha: string;
  policyVersion: string;
  rubricVersion: string;
  sourceIdentity: string;
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;

/** Check that an adapter returned a structurally complete, diagnostic-free proof. */
export function isTrustedLifecycleTailProof(proof: LifecycleTailProofCandidate | null): proof is LifecycleTailProof {
  return proof !== null
    && proof.schemaVersion === 1
    && proof.diagnostics.length === 0
    && SHA.test(proof.reviewedThroughSha)
    && SHA.test(proof.currentHeadSha)
    && SHA.test(proof.diffBaseSha)
    && DIGEST.test(proof.policyVersion)
    && nonEmpty(proof.predicateId)
    && nonEmpty(proof.baseRef)
    && nonEmpty(proof.rubricVersion)
    && nonEmpty(proof.sourceIdentity)
    && nonEmpty(proof.artifact.workUnitId)
    && nonEmpty(proof.artifact.artifactGroupId);
}

/**
 * Determine whether an adapter-supplied proof exactly carries one source's prior coverage.
 * Mismatched, incomplete, or diagnostic-bearing proofs deliberately carry no authority.
 */
export function isApplicableLifecycleTail(input: LifecycleTailApplicabilityInput): boolean {
  const proof = input.proof;
  if (!isTrustedLifecycleTailProof(proof)) return false;
  return proof.predicateId === input.predicateId
    && proof.reviewedThroughSha === input.reviewedThroughSha
    && proof.currentHeadSha === input.currentHeadSha
    && proof.baseRef === input.baseRef
    && proof.diffBaseSha === input.diffBaseSha
    && proof.policyVersion === input.policyVersion
    && proof.rubricVersion === input.rubricVersion
    && proof.sourceIdentity === input.sourceIdentity;
}

/** Construct a v2 lifecycle-tail record without granting applicability. */
export function createForwardLifecycleTailProof(
  input: ForwardLifecycleTailProofInput,
): ForwardLifecycleTailProof {
  const priorTarget = validateReviewTarget(input.priorTarget);
  const currentTarget = validateReviewTarget(input.currentTarget);
  return ForwardLifecycleTailProofSchema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    predicateId: input.predicateId,
    priorTargetId: priorTarget.targetId,
    currentTargetId: currentTarget.targetId,
    priorHeadTree: priorTarget.headTree,
    currentHeadTree: currentTarget.headTree,
    reviewedSurface: input.reviewedSurface,
    currentSurface: input.currentSurface,
    policyVersion: input.policyVersion,
    rubricVersion: input.rubricVersion,
    rubricDigest: input.rubricDigest,
    sourceIdentity: input.sourceIdentity,
    artifact: input.artifact,
    applicability: { treatment: "carry", scope: "review-coverage-only" },
    diagnostics: input.diagnostics,
  });
}

/** Apply a diagnostic-free v2 proof only to exact review coverage. */
export function isApplicableForwardLifecycleTail(
  input: ForwardLifecycleTailApplicabilityInput,
): boolean {
  const parsed = ForwardLifecycleTailProofSchema.safeParse(input.proof);
  if (!parsed.success || parsed.data.diagnostics.length > 0) return false;
  let priorTarget: ReviewTarget;
  let currentTarget: ReviewTarget;
  try {
    priorTarget = validateReviewTarget(input.priorTarget);
    currentTarget = validateReviewTarget(input.currentTarget);
  } catch {
    return false;
  }
  const proof = parsed.data;
  return proof.priorTargetId === priorTarget.targetId
    && proof.currentTargetId === currentTarget.targetId
    && proof.priorHeadTree === priorTarget.headTree
    && proof.currentHeadTree === currentTarget.headTree
    && proof.policyVersion === input.policyVersion
    && proof.rubricVersion === input.rubricVersion
    && proof.rubricDigest === input.rubricDigest
    && proof.sourceIdentity === input.sourceIdentity
    && proof.reviewedSurface.treeId === proof.currentSurface.treeId
    && proof.reviewedSurface.pathManifestDigest === proof.currentSurface.pathManifestDigest
    && proof.reviewedSurface.semanticDigest === proof.currentSurface.semanticDigest;
}

/** Register the strict forward lifecycle-tail proof schema. */
export function registerForwardLifecycleTailSchema(registry: KernelRegistry): KernelRegistry {
  registry.register(ForwardLifecycleTailProofSchema, {
    id: "review-lifecycle-tail-proof",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
