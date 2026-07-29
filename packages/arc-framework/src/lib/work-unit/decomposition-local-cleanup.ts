/**
 * Read-only local cleanup eligibility derived from one shared exact-base
 * decomposition integration anchor.
 */

import type {
  DecompositionClaimRetirement,
  DecompositionIntegrationAnchor,
  DecompositionIntegrationAnchorResult,
} from "./decomposition-integration-anchor.js";

/** Exact local retiring projection presented for cleanup. */
export interface DecompositionLocalCleanupRequest {
  origin: string;
  branch: string;
  head: string;
  locality: "local" | "remote";
}

/** Exact-base selection supplied by the shared anchor producer or its Git adapter. */
export type DecompositionLocalCleanupAnchorSelection =
  | DecompositionIntegrationAnchorResult
  | { status: "stale"; reason: "configured-base-raced" }
  | { status: "refused"; reason: "git-read-failed" | "namespace-corrupt" };

/** Closed local cleanup authority. Directional mutation remains a later concern. */
export interface DecompositionLocalCleanupEligibility {
  kind: "decomposition-local-cleanup";
  schemaVersion: 1;
  integrationAnchor: DecompositionIntegrationAnchor;
  claimRetirement: DecompositionClaimRetirement;
  subject: { kind: "work-unit"; name: string };
  source: { branch: string; head: string };
  local: {
    branch: true;
    worktree: true;
    userWorkspace: true;
  };
  remote: { kind: "not-authorized" };
}

export type DecompositionLocalCleanupResult =
  | { status: "eligible"; cleanup: DecompositionLocalCleanupEligibility }
  | {
    status: "ineligible";
    reason:
      | "anchor-unavailable"
      | "origin-mismatch"
      | "branch-mismatch"
      | "head-mismatch"
      | "remote-not-authorized";
  };

/**
 * Compose local-only cleanup eligibility without revalidating receipt or
 * landing authority.
 *
 * @param selection - Result from the shared exact-base anchor producer
 * @param request - Exact retiring projection and requested locality
 * @returns Local-only eligibility or one closed refusal
 */
export function deriveDecompositionLocalCleanupEligibility(
  selection: DecompositionLocalCleanupAnchorSelection,
  request: DecompositionLocalCleanupRequest,
): DecompositionLocalCleanupResult {
  if (selection.status !== "resolved") {
    return { status: "ineligible", reason: "anchor-unavailable" };
  }
  const { anchor } = selection;
  const sourceBranch = anchor.receipt.prepared.completedMap.machine.source.logicalBranch;
  if (request.origin !== anchor.origin) {
    return { status: "ineligible", reason: "origin-mismatch" };
  }
  if (request.branch !== sourceBranch) {
    return { status: "ineligible", reason: "branch-mismatch" };
  }
  if (request.head !== anchor.sourceHead) {
    return { status: "ineligible", reason: "head-mismatch" };
  }
  if (request.locality !== "local") {
    return { status: "ineligible", reason: "remote-not-authorized" };
  }
  return {
    status: "eligible",
    cleanup: {
      kind: "decomposition-local-cleanup",
      schemaVersion: 1,
      integrationAnchor: anchor,
      claimRetirement: anchor.claimRetirement,
      subject: { kind: "work-unit", name: anchor.origin },
      source: { branch: sourceBranch, head: anchor.sourceHead },
      local: { branch: true, worktree: true, userWorkspace: true },
      remote: { kind: "not-authorized" },
    },
  };
}
