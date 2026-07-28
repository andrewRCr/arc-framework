/** Exact-generation discard driver for one uncommitted decomposition candidate. */

import { canonicalDigest, type CanonicalDigest } from "../canonical/canonical-json.js";
import type { DecomposeTransientClaimStore } from "./decompose-transient-claim-store.js";
import type {
  DecomposeTransientClaim,
  DecomposeTransientClaimBinding,
  DecomposeTransientReleaseEvidence,
} from "./decompose-transient-claim.js";
import { decomposeTransientClaimId } from "./decompose-transient-claim.js";

export interface V3DecomposeDiscardAuthority {
  planId: CanonicalDigest;
  binding: DecomposeTransientClaimBinding;
}

export type V3DecomposeDiscardRevalidation =
  | { status: "current"; authority: V3DecomposeDiscardAuthority }
  | { status: "refused"; reason: string };

export type V3DecomposeDiscardCandidateInspection =
  | {
      status: "exact";
      path: string;
      candidateHead: string;
      uncommitted: true;
      finalized: false;
      bindingMatches: true;
    }
  | { status: "absent" }
  | { status: "refused"; reason: string };

export interface V3DecomposeCandidateDiscardDependencies {
  claims: Pick<DecomposeTransientClaimStore, "read" | "retire" | "release">;
  revalidate(origin: string, cutMapPath: string): Promise<V3DecomposeDiscardRevalidation>;
  inspect(
    authority: V3DecomposeDiscardAuthority,
    claim: DecomposeTransientClaim,
  ): Promise<V3DecomposeDiscardCandidateInspection>;
  cleanup(input: {
    authority: V3DecomposeDiscardAuthority;
    claim: DecomposeTransientClaim;
    path: string;
  }): Promise<{ status: "cleaned" | "already-absent" } | { status: "refused"; reason: string }>;
  verifyAbsent(input: {
    authority: V3DecomposeDiscardAuthority;
    claim: DecomposeTransientClaim;
    path: string;
  }): Promise<DecomposeTransientReleaseEvidence>;
}

export type V3DecomposeCandidateDiscardResult =
  | {
      status: "discarded";
      claimId: CanonicalDigest;
      generation: number;
      candidateBranch: string;
    }
  | {
      status: "already-discarded";
      claimId: CanonicalDigest;
      generation: number;
      candidateBranch: string;
    }
  | {
      status: "refused";
      reason: string;
      recovery:
        | { kind: "none" }
        | {
            kind: "discard-terminal";
            claimId: CanonicalDigest;
            generation: number;
            candidateBranch: string;
            path: string;
          };
    };

function bindingsMatch(
  claim: DecomposeTransientClaim,
  authority: V3DecomposeDiscardAuthority,
): boolean {
  return canonicalDigest(claim.binding) === canonicalDigest(authority.binding)
    && claim.claimId === decomposeTransientClaimId(authority.binding);
}

function terminalRecovery(claim: DecomposeTransientClaim, path: string) {
  return {
    kind: "discard-terminal" as const,
    claimId: claim.claimId,
    generation: claim.generation,
    candidateBranch: claim.binding.candidateBranch,
    path,
  };
}

/**
 * Retire, clean, and release only the exact candidate generation selected by current source/map authority.
 *
 * Candidate absence is actionable only after a matching discarded terminal exists. A released matching
 * terminal is the sole already-complete proof.
 */
export async function discardV3DecomposeCandidate(
  origin: string,
  cutMapPath: string,
  deps: V3DecomposeCandidateDiscardDependencies,
): Promise<V3DecomposeCandidateDiscardResult> {
  const revalidated = await deps.revalidate(origin, cutMapPath);
  if (revalidated.status === "refused") {
    return { status: "refused", reason: revalidated.reason, recovery: { kind: "none" } };
  }
  const { authority } = revalidated;
  if (authority.binding.origin !== origin
    || authority.binding.candidateBranch !== `chore/decompose-${origin}`) {
    return { status: "refused", reason: "candidate-binding-mismatch", recovery: { kind: "none" } };
  }
  const read = await deps.claims.read(decomposeTransientClaimId(authority.binding));
  if (read.status !== "found" || !bindingsMatch(read.claim, authority)) {
    return {
      status: "refused",
      reason: read.status === "missing" ? "candidate-missing-unproven" : "candidate-binding-mismatch",
      recovery: { kind: "none" },
    };
  }
  let claim = read.claim;
  const expectedTerminal = {
    kind: "discarded" as const,
    planId: authority.planId,
    candidateHead: authority.binding.resultBaseHead,
  };
  if (claim.state.kind === "terminal") {
    if (canonicalDigest(claim.state.terminal) !== canonicalDigest(expectedTerminal)) {
      return { status: "refused", reason: "opposite-or-changed-terminal", recovery: { kind: "none" } };
    }
    if (claim.registration.kind === "released") {
      return {
        status: "already-discarded",
        claimId: claim.claimId,
        generation: claim.generation,
        candidateBranch: claim.binding.candidateBranch,
      };
    }
  } else if (claim.state.kind !== "occupied" || claim.registration.kind !== "registered") {
    return { status: "refused", reason: "candidate-not-occupied", recovery: { kind: "none" } };
  }
  if (claim.registration.kind !== "registered") {
    return { status: "refused", reason: "candidate-registration-mismatch", recovery: { kind: "none" } };
  }
  const path = claim.registration.path;

  if (claim.state.kind !== "terminal") {
    const inspected = await deps.inspect(authority, claim);
    if (inspected.status !== "exact"
      || inspected.path !== path
      || inspected.candidateHead !== authority.binding.resultBaseHead) {
      return {
        status: "refused",
        reason: inspected.status === "refused" ? inspected.reason : "candidate-not-exact",
        recovery: { kind: "none" },
      };
    }
    const retired = await deps.claims.retire(claim.claimId, claim.generation, expectedTerminal);
    if (retired.status !== "retired" && retired.status !== "already-retired-matching") {
      return { status: "refused", reason: "claim-retirement-refused", recovery: { kind: "none" } };
    }
    claim = retired.claim;
  }

  const cleanup = await deps.cleanup({ authority, claim, path });
  if (cleanup.status === "refused") {
    return {
      status: "refused",
      reason: cleanup.reason,
      recovery: terminalRecovery(claim, path),
    };
  }
  const absence = await deps.verifyAbsent({ authority, claim, path });
  const released = await deps.claims.release(
    claim.claimId,
    claim.generation,
    claim.candidateWorktree,
    path,
    absence,
  );
  if (released.status !== "released" && released.status !== "already-released-matching") {
    return {
      status: "refused",
      reason: "claim-release-refused",
      recovery: terminalRecovery(claim, path),
    };
  }
  return {
    status: "discarded",
    claimId: released.claim.claimId,
    generation: released.claim.generation,
    candidateBranch: released.claim.binding.candidateBranch,
  };
}
