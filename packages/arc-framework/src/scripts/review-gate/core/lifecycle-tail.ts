/** Storage-neutral lifecycle-tail proof and applicability reduction. */

/** Stable diagnostics emitted when a lifecycle-tail bridge cannot be trusted. */
export type LifecycleTailDiagnostic =
  | "invalid-predicate"
  | "invalid-identity"
  | "base-ref-drift"
  | "diff-base-drift"
  | "policy-version-drift"
  | "rubric-version-drift"
  | "source-identity-drift"
  | "ambiguous-artifact-group"
  | "invalid-artifact-group"
  | "unrecognized-tail-change"
  | "tail-unavailable";

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
