/**
 * Claim-retirement gate for exact-base decomposition local cleanup.
 *
 * The gate consumes the shared integration-anchor selection, retires only the
 * receipt-bound full-protection generation, and leaves directional cleanup to
 * the caller.
 */

import { isCanonicalDigest } from "../canonical/canonical-json.js";
import {
  decomposeCandidateBranch,
  decomposeTransientClaimId,
  type DecomposeTransientClaim,
  type DecomposeTransientReleaseEvidence,
} from "./decompose-transient-claim.js";
import type { DecomposeTransientClaimStore } from "./decompose-transient-claim-store.js";
import {
  deriveDecompositionLocalCleanupEligibility,
  type DecompositionLocalCleanupAnchorSelection,
  type DecompositionLocalCleanupEligibility,
  type DecompositionLocalCleanupRequest,
} from "./decomposition-local-cleanup.js";

type DecompositionCleanupClaimPort = Pick<
  DecomposeTransientClaimStore,
  "read" | "release" | "retire"
>;

export interface DecompositionCleanupAuthorization {
  kind: "decomposition-cleanup-authorization";
  schemaVersion: 1;
  cleanup: DecompositionLocalCleanupEligibility;
  retirement:
    | {
      kind: "required";
      outcome: "retired" | "already-retired-matching";
      claim: DecomposeTransientClaim;
    }
    | { kind: "not-applicable"; protection: "partial" };
}

export type DecompositionCleanupAuthorizationResult =
  | { status: "authorized"; authorization: DecompositionCleanupAuthorization }
  | {
    status: "refused";
    reason:
      | "anchor-ineligible"
      | "claim-conflict"
      | "claim-mismatch"
      | "claim-missing-unproven"
      | "claim-unavailable"
      | "partial-claim-present"
      | "partial-claim-unproven";
  };

export type DecompositionCleanupCompletion =
  | { status: "failed" }
  | { status: "completed"; releaseEvidence: DecomposeTransientReleaseEvidence };

export type DecompositionCleanupReleaseResult =
  | { status: "not-applicable" }
  | {
    status: "released";
    outcome: "released" | "already-released-matching";
    claim: DecomposeTransientClaim;
  }
  | {
    status: "preserved";
    reason: "cleanup-incomplete" | "release-conflict" | "release-unavailable";
  };

/**
 * Retire the exact receipt-bound claim before exposing actionable local cleanup.
 *
 * @param selection - Shared exact-base anchor result
 * @param request - Exact local retiring projection
 * @param claims - Serialized repository-common claim port
 * @returns Actionable cleanup only after its claim arm is satisfied
 */
export async function authorizeDecompositionCleanup(
  selection: DecompositionLocalCleanupAnchorSelection,
  request: DecompositionLocalCleanupRequest,
  claims: DecompositionCleanupClaimPort,
): Promise<DecompositionCleanupAuthorizationResult> {
  const eligibility = deriveDecompositionLocalCleanupEligibility(selection, request);
  if (eligibility.status !== "eligible") {
    return { status: "refused", reason: "anchor-ineligible" };
  }
  const { cleanup } = eligibility;
  const retirement = cleanup.claimRetirement;
  if (retirement.kind !== "required") {
    const candidateBranch = decomposeCandidateBranch(cleanup.integrationAnchor.origin);
    const candidateClaimId = decomposeTransientClaimId({
      origin: cleanup.integrationAnchor.origin,
      candidateBranch,
    });
    let current: Awaited<ReturnType<DecompositionCleanupClaimPort["read"]>>;
    try {
      current = await claims.read(candidateClaimId);
    } catch {
      return { status: "refused", reason: "partial-claim-unproven" };
    }
    if (current.status === "malformed") {
      return { status: "refused", reason: "partial-claim-unproven" };
    }
    if (current.status === "found") {
      return { status: "refused", reason: "partial-claim-present" };
    }
    return {
      status: "authorized",
      authorization: {
        kind: "decomposition-cleanup-authorization",
        schemaVersion: 1,
        cleanup,
        retirement: { kind: "not-applicable", protection: "partial" },
      },
    };
  }
  if (!isCanonicalDigest(retirement.claimId)) {
    return { status: "refused", reason: "claim-mismatch" };
  }

  let stored: Awaited<ReturnType<DecompositionCleanupClaimPort["read"]>>;
  try {
    stored = await claims.read(retirement.claimId);
  } catch {
    return { status: "refused", reason: "claim-unavailable" };
  }
  if (stored.status === "missing") {
    return { status: "refused", reason: "claim-missing-unproven" };
  }
  if (stored.status === "malformed") {
    return { status: "refused", reason: "claim-mismatch" };
  }
  const { claim } = stored;
  if (claim.claimId !== retirement.claimId
    || claim.generation !== retirement.generation
    || claim.candidateWorktree !== retirement.candidateWorktree
    || claim.binding.origin !== cleanup.integrationAnchor.origin
    || claim.binding.candidateBranch !== retirement.candidateBranch
    || claim.binding.sourceHead !== cleanup.integrationAnchor.sourceHead
    || claim.binding.resultBaseHead !== cleanup.integrationAnchor.preparedBaseHead
    || claim.binding.cutMapDigest !== cleanup.integrationAnchor.receipt.prepared.cutMapDigest) {
    return { status: "refused", reason: "claim-mismatch" };
  }

  let retired: Awaited<ReturnType<DecompositionCleanupClaimPort["retire"]>>;
  try {
    retired = await claims.retire(retirement.claimId, retirement.generation, {
      kind: "landed",
      receiptId: cleanup.integrationAnchor.receiptId,
      candidateHead: cleanup.integrationAnchor.candidateCommitHead,
    });
  } catch {
    return { status: "refused", reason: "claim-unavailable" };
  }
  if (retired.status === "missing-unproven") {
    return { status: "refused", reason: "claim-missing-unproven" };
  }
  if (retired.status === "conflict") {
    return { status: "refused", reason: "claim-conflict" };
  }
  return {
    status: "authorized",
    authorization: {
      kind: "decomposition-cleanup-authorization",
      schemaVersion: 1,
      cleanup,
      retirement: {
        kind: "required",
        outcome: retired.status,
        claim: retired.claim,
      },
    },
  };
}

/**
 * Release the exact terminal registration after local cleanup and absence proof.
 *
 * @param authorization - Previously granted cleanup authority
 * @param completion - Cleanup outcome and exact absence evidence
 * @param claims - Serialized repository-common claim port
 * @returns Released, preserved, or partial-protection result
 */
export async function releaseDecompositionCleanupRegistration(
  authorization: DecompositionCleanupAuthorization,
  completion: DecompositionCleanupCompletion,
  claims: DecompositionCleanupClaimPort,
): Promise<DecompositionCleanupReleaseResult> {
  if (authorization.retirement.kind === "not-applicable") {
    return { status: "not-applicable" };
  }
  if (completion.status !== "completed") {
    return { status: "preserved", reason: "cleanup-incomplete" };
  }
  const { claim } = authorization.retirement;
  const registration = claim.registration;
  const path = registration.kind === "registered"
    ? registration.path
    : registration.kind === "released"
      ? registration.lastPath
      : null;
  if (path === null) {
    return { status: "preserved", reason: "release-conflict" };
  }

  let released: Awaited<ReturnType<DecompositionCleanupClaimPort["release"]>>;
  try {
    released = await claims.release(
      claim.claimId,
      claim.generation,
      claim.candidateWorktree,
      path,
      completion.releaseEvidence,
    );
  } catch {
    return { status: "preserved", reason: "release-unavailable" };
  }
  if (released.status === "conflict") {
    return { status: "preserved", reason: "release-conflict" };
  }
  return {
    status: "released",
    outcome: released.status,
    claim: released.claim,
  };
}
