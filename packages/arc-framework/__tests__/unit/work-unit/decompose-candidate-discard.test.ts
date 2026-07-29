import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  discardV3DecomposeCandidate,
  type V3DecomposeCandidateDiscardDependencies,
  type V3DecomposeDiscardAuthority,
} from "../../../src/lib/work-unit/decompose-candidate-discard.js";
import {
  decomposeTransientClaimId,
  releaseDecomposeTransientWorktree,
  retireDecomposeTransientClaim,
  type DecomposeTransientClaim,
} from "../../../src/lib/work-unit/decompose-transient-claim.js";
import { v3CandidateWorktreeId } from "../../../src/lib/work-unit/decompose-v3-preparation.js";

const path = "/repo/.git/arc/decompose-candidate";
const authority: V3DecomposeDiscardAuthority = {
  planId: canonicalDigest("plan"),
  binding: {
    origin: "origin",
    candidateBranch: "chore/decompose-origin",
    sourceHead: "source-head",
    resultBaseHead: "base-head",
    cutMapDigest: canonicalDigest("map"),
  },
};

function occupiedClaim(): DecomposeTransientClaim {
  const claimId = decomposeTransientClaimId(authority.binding);
  return {
    schemaVersion: 1,
    kind: "decomposition-candidate",
    claimId,
    generation: 3,
    binding: authority.binding,
    candidateWorktree: v3CandidateWorktreeId(claimId, 3),
    state: { kind: "occupied" },
    registration: { kind: "registered", path },
  };
}

function harness(overrides: {
  claim?: DecomposeTransientClaim | null;
  inspect?: V3DecomposeCandidateDiscardDependencies["inspect"];
  cleanup?: V3DecomposeCandidateDiscardDependencies["cleanup"];
  verifyAbsent?: V3DecomposeCandidateDiscardDependencies["verifyAbsent"];
  revalidate?: V3DecomposeCandidateDiscardDependencies["revalidate"];
} = {}) {
  let claim = overrides.claim === undefined ? occupiedClaim() : overrides.claim;
  let cleanupCalls = 0;
  let inspectCalls = 0;
  const deps: V3DecomposeCandidateDiscardDependencies = {
    claims: {
      read: async () => claim === null ? { status: "missing" } : { status: "found", claim },
      retire: async (claimId, generation, terminal) => {
        const result = retireDecomposeTransientClaim(claim, claimId, generation, terminal);
        if (result.status === "retired") claim = result.claim;
        return result;
      },
      release: async (claimId, generation, worktree, selectedPath, evidence) => {
        const result = releaseDecomposeTransientWorktree(
          claim,
          claimId,
          generation,
          worktree,
          selectedPath,
          evidence,
        );
        if (result.status === "released") claim = result.claim;
        return result;
      },
    },
    revalidate: overrides.revalidate ?? (async () => ({ status: "current", authority })),
    inspect: async (...args) => {
      inspectCalls += 1;
      return (overrides.inspect ?? (async () => ({
        status: "exact",
        path,
        candidateHead: authority.binding.resultBaseHead,
        uncommitted: true,
        finalized: false,
        bindingMatches: true,
      })))(...args);
    },
    cleanup: async (...args) => {
      cleanupCalls += 1;
      return (overrides.cleanup ?? (async () => ({ status: "cleaned" })))(...args);
    },
    verifyAbsent: overrides.verifyAbsent ?? (async () => ({
      registrationAbsent: true,
      markerAbsent: true,
      branchOccupationAbsent: true,
    })),
  };
  return {
    deps,
    claim: () => claim,
    cleanupCalls: () => cleanupCalls,
    inspectCalls: () => inspectCalls,
  };
}

describe("discardV3DecomposeCandidate", () => {
  it("discards one exact uncommitted candidate and recognizes only its released terminal as complete", async () => {
    const h = harness();
    const first = await discardV3DecomposeCandidate("origin", "map.json", h.deps);
    expect(first).toMatchObject({
      status: "discarded",
      claimId: occupiedClaim().claimId,
      generation: 3,
      candidateBranch: "chore/decompose-origin",
    });
    expect(h.claim()).toMatchObject({
      state: {
        kind: "terminal",
        terminal: {
          kind: "discarded",
          planId: authority.planId,
          candidateHead: "base-head",
        },
      },
      registration: { kind: "released", lastPath: path },
    });

    expect(await discardV3DecomposeCandidate("origin", "map.json", h.deps)).toMatchObject({
      status: "already-discarded",
      claimId: occupiedClaim().claimId,
      generation: 3,
    });
    expect(h.cleanupCalls()).toBe(1);
  });

  it("refuses changed, foreign, committed, finalized, missing, or concurrently moved candidates", async () => {
    const refusals: Array<{
      expected: string;
      harness: ReturnType<typeof harness>;
    }> = [
      {
        expected: "source-moved",
        harness: harness({
          revalidate: async () => ({ status: "refused", reason: "source-moved" }),
        }),
      },
      {
        expected: "candidate-binding-mismatch",
        harness: harness({
          claim: {
            ...occupiedClaim(),
            binding: { ...authority.binding, sourceHead: "foreign-source" },
          },
        }),
      },
      {
        expected: "candidate-committed",
        harness: harness({
          inspect: async () => ({ status: "refused", reason: "candidate-committed" }),
        }),
      },
      {
        expected: "candidate-finalized",
        harness: harness({
          inspect: async () => ({ status: "refused", reason: "candidate-finalized" }),
        }),
      },
      {
        expected: "candidate-missing-unproven",
        harness: harness({ claim: null }),
      },
      {
        expected: "candidate-not-exact",
        harness: harness({
          inspect: async () => ({
            status: "exact",
            path: "/repo/moved",
            candidateHead: "base-head",
            uncommitted: true,
            finalized: false,
            bindingMatches: true,
          }),
        }),
      },
      {
        expected: "candidate-changed",
        harness: harness({
          inspect: async () => ({ status: "refused", reason: "candidate-changed" }),
        }),
      },
    ];
    for (const entry of refusals) {
      const result = await discardV3DecomposeCandidate("origin", "map.json", entry.harness.deps);
      expect(result).toEqual({
        status: "refused",
        reason: entry.expected,
        recovery: { kind: "none" },
      });
      expect(entry.harness.cleanupCalls()).toBe(0);
    }
  });

  it("resumes cleanup from matching retired authority after cleanup or release failure", async () => {
    let failCleanup = true;
    const cleanupFailure = harness({
      cleanup: async () => failCleanup
        ? { status: "refused", reason: "cleanup-failed" }
        : { status: "already-absent" },
    });
    expect(await discardV3DecomposeCandidate("origin", "map.json", cleanupFailure.deps)).toMatchObject({
      status: "refused",
      reason: "cleanup-failed",
      recovery: { kind: "discard-terminal", path },
    });
    expect(cleanupFailure.claim()).toMatchObject({
      state: { kind: "terminal", terminal: { kind: "discarded" } },
      registration: { kind: "registered", path },
    });
    failCleanup = false;
    expect(await discardV3DecomposeCandidate("origin", "map.json", cleanupFailure.deps))
      .toMatchObject({ status: "discarded" });
    expect(cleanupFailure.inspectCalls()).toBe(1);

    let absenceExact = false;
    const releaseFailure = harness({
      verifyAbsent: async () => ({
        registrationAbsent: absenceExact,
        markerAbsent: absenceExact,
        branchOccupationAbsent: absenceExact,
      }),
    });
    expect(await discardV3DecomposeCandidate("origin", "map.json", releaseFailure.deps)).toMatchObject({
      status: "refused",
      reason: "claim-release-refused",
      recovery: { kind: "discard-terminal", path },
    });
    absenceExact = true;
    expect(await discardV3DecomposeCandidate("origin", "map.json", releaseFailure.deps))
      .toMatchObject({ status: "discarded" });
    expect(releaseFailure.inspectCalls()).toBe(1);
  });

  it("never treats candidate absence or an opposite terminal as discard proof", async () => {
    const absent = harness({
      inspect: async () => ({ status: "absent" }),
    });
    expect(await discardV3DecomposeCandidate("origin", "map.json", absent.deps)).toEqual({
      status: "refused",
      reason: "candidate-not-exact",
      recovery: { kind: "none" },
    });

    const oppositeClaim = occupiedClaim();
    oppositeClaim.state = {
      kind: "terminal",
      terminal: {
        kind: "landed",
        receiptId: canonicalDigest("receipt"),
        candidateHead: "candidate-commit",
      },
    };
    const opposite = harness({ claim: oppositeClaim });
    expect(await discardV3DecomposeCandidate("origin", "map.json", opposite.deps)).toEqual({
      status: "refused",
      reason: "opposite-or-changed-terminal",
      recovery: { kind: "none" },
    });
    expect(opposite.cleanupCalls()).toBe(0);
  });
});
