import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  acquireDecomposeTransientClaim,
  decomposeTransientClaimId,
  occupyDecomposeTransientClaim,
  parseDecomposeTransientClaim,
  releaseDecomposeTransientWorktree,
  reserveDecomposeTransientWorktree,
  retireDecomposeTransientClaim,
} from "../../../src/lib/work-unit/decompose-transient-claim.js";

const CUT_MAP_DIGEST = canonicalDigest({ cut: "map" });

function binding(overrides: Partial<{
  origin: string;
  candidateBranch: string;
  sourceHead: string;
  resultBase: string;
  cutMapDigest: typeof CUT_MAP_DIGEST;
}> = {}) {
  return {
    origin: "origin",
    candidateBranch: "arc/decompose/origin/candidate",
    sourceHead: "source-head",
    resultBase: "result-base",
    cutMapDigest: CUT_MAP_DIGEST,
    ...overrides,
  };
}

function acquire() {
  const input = binding();
  const claimId = decomposeTransientClaimId(input);
  const result = acquireDecomposeTransientClaim(null, claimId, input);
  expect(result.status).toBe("acquired");
  if (result.status !== "acquired") throw new Error("expected acquisition");
  return result.claim;
}

function occupy() {
  const acquired = acquire();
  const path = "/repo/.git/arc/worktrees/candidate";
  const reserved = reserveDecomposeTransientWorktree(acquired, acquired.claimId, acquired.generation, path);
  expect(reserved.status).toBe("reserved");
  if (reserved.status !== "reserved") throw new Error("expected reservation");
  const occupied = occupyDecomposeTransientClaim(
    reserved.claim,
    acquired.claimId,
    acquired.generation,
    path,
    {
      registrations: [{
        path,
        candidateBranch: acquired.candidateBranch,
        head: acquired.resultBase,
      }],
      branch: {
        candidateBranch: acquired.candidateBranch,
        head: acquired.resultBase,
      },
      marker: {
        claimId: acquired.claimId,
        generation: acquired.generation,
        candidateWorktree: acquired.candidateWorktree,
      },
    },
  );
  expect(occupied.status).toBe("occupied");
  if (occupied.status !== "occupied") throw new Error("expected occupation");
  return { claim: occupied.claim, path };
}

describe("decomposition transient claim", () => {
  it("derives independent claim IDs from origin and candidate branch", () => {
    const first = binding();
    expect(decomposeTransientClaimId(first)).toBe(canonicalDigest({
      schemaVersion: 1,
      kind: "decomposition-candidate",
      origin: first.origin,
      candidateBranch: first.candidateBranch,
    }));
    expect(decomposeTransientClaimId(first)).not.toBe(decomposeTransientClaimId(binding({
      candidateBranch: "arc/decompose/origin/other",
    })));
    expect(decomposeTransientClaimId(first)).not.toBe(decomposeTransientClaimId(binding({
      origin: "other-origin",
    })));
  });

  it("acquires a pathless positive generation with stable opaque worktree identity", () => {
    const claim = acquire();
    expect(claim).toMatchObject({
      schemaVersion: 1,
      kind: "decomposition-candidate",
      generation: 1,
      state: "pending",
      registration: { kind: "unregistered" },
    });
    expect(claim.candidateWorktree).toBe(canonicalDigest({
      schemaVersion: 1,
      kind: "decomposition-candidate-worktree",
      claimId: claim.claimId,
      generation: 1,
    }));

    const path = "/repo/.git/arc/worktrees/renamed-locally";
    const reserved = reserveDecomposeTransientWorktree(claim, claim.claimId, 1, path);
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") throw new Error("expected reservation");
    expect(reserved.claim.candidateWorktree).toBe(claim.candidateWorktree);
    expect(JSON.stringify({
      claimId: claim.claimId,
      generation: claim.generation,
      candidateWorktree: claim.candidateWorktree,
    })).not.toContain(path);
  });

  it("makes exact acquire and reserve retries idempotent but rejects mismatches", () => {
    const claim = acquire();
    expect(acquireDecomposeTransientClaim(claim, claim.claimId, binding())).toEqual({
      status: "already-acquired-matching",
      claim,
    });
    expect(acquireDecomposeTransientClaim(claim, claim.claimId, binding({ sourceHead: "other" }))).toEqual({
      status: "conflict",
      reason: "binding-mismatch",
    });

    const path = "/repo/.git/arc/worktrees/candidate";
    const reserved = reserveDecomposeTransientWorktree(claim, claim.claimId, 1, path);
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") throw new Error("expected reservation");
    expect(reserveDecomposeTransientWorktree(reserved.claim, claim.claimId, 1, path)).toEqual({
      status: "already-reserved-matching",
      claim: reserved.claim,
    });
    expect(reserveDecomposeTransientWorktree(reserved.claim, claim.claimId, 1, `${path}-other`)).toEqual({
      status: "conflict",
      reason: "registration-mismatch",
    });
  });

  it("occupies only with one exact registration, branch, and marker projection", () => {
    const claim = acquire();
    const path = "/repo/.git/arc/worktrees/candidate";
    const reserved = reserveDecomposeTransientWorktree(claim, claim.claimId, 1, path);
    if (reserved.status !== "reserved") throw new Error("expected reservation");
    const exact = {
      registrations: [{ path, candidateBranch: claim.candidateBranch, head: claim.resultBase }],
      branch: { candidateBranch: claim.candidateBranch, head: claim.resultBase },
      marker: {
        claimId: claim.claimId,
        generation: 1,
        candidateWorktree: claim.candidateWorktree,
      },
    };
    const occupied = occupyDecomposeTransientClaim(reserved.claim, claim.claimId, 1, path, exact);
    expect(occupied.status).toBe("occupied");
    if (occupied.status !== "occupied") throw new Error("expected occupation");
    expect(occupied.claim.registration).toEqual({ kind: "registered", path });
    expect(occupyDecomposeTransientClaim(occupied.claim, claim.claimId, 1, path, exact)).toEqual({
      status: "already-occupied-matching",
      claim: occupied.claim,
    });
    expect(occupyDecomposeTransientClaim(reserved.claim, claim.claimId, 1, path, {
      ...exact,
      registrations: [],
    })).toEqual({ status: "conflict", reason: "registration-not-exact" });
    expect(occupyDecomposeTransientClaim(reserved.claim, claim.claimId, 1, path, {
      ...exact,
      registrations: [exact.registrations[0]!, exact.registrations[0]!],
    })).toEqual({ status: "conflict", reason: "registration-not-exact" });
  });

  it("retires and releases with exact-generation CAS and advances only a released terminal", () => {
    const occupied = occupy();
    const retired = retireDecomposeTransientClaim(
      occupied.claim,
      occupied.claim.claimId,
      occupied.claim.generation,
      "landed",
    );
    expect(retired.status).toBe("retired");
    if (retired.status !== "retired") throw new Error("expected retirement");
    expect(retireDecomposeTransientClaim(
      retired.claim,
      retired.claim.claimId,
      retired.claim.generation,
      "landed",
    )).toEqual({ status: "already-retired-matching", claim: retired.claim });
    expect(retireDecomposeTransientClaim(
      retired.claim,
      retired.claim.claimId,
      retired.claim.generation,
      "discarded",
    )).toEqual({ status: "conflict", reason: "terminal-mismatch" });

    expect(acquireDecomposeTransientClaim(retired.claim, retired.claim.claimId, binding())).toEqual({
      status: "conflict",
      reason: "registration-not-released",
    });
    const released = releaseDecomposeTransientWorktree(
      retired.claim,
      retired.claim.claimId,
      retired.claim.generation,
      retired.claim.candidateWorktree,
      occupied.path,
      { registrationAbsent: true, markerAbsent: true, branchOccupationAbsent: true },
    );
    expect(released.status).toBe("released");
    if (released.status !== "released") throw new Error("expected release");
    expect(releaseDecomposeTransientWorktree(
      released.claim,
      released.claim.claimId,
      released.claim.generation,
      released.claim.candidateWorktree,
      occupied.path,
      { registrationAbsent: true, markerAbsent: true, branchOccupationAbsent: true },
    )).toEqual({ status: "already-released-matching", claim: released.claim });

    const next = acquireDecomposeTransientClaim(released.claim, released.claim.claimId, binding());
    expect(next.status).toBe("acquired");
    if (next.status !== "acquired") throw new Error("expected next generation");
    expect(next.claim.generation).toBe(2);
    expect(next.claim.candidateWorktree).not.toBe(released.claim.candidateWorktree);
    expect(reserveDecomposeTransientWorktree(next.claim, next.claim.claimId, 1, occupied.path)).toEqual({
      status: "conflict",
      reason: "generation-mismatch",
    });
  });

  it("fails closed for missing, unproven release, foreign identity, and malformed records", () => {
    const claim = acquire();
    expect(retireDecomposeTransientClaim(null, claim.claimId, 1, "landed")).toEqual({
      status: "missing-unproven",
      reason: "claim-missing",
    });
    expect(reserveDecomposeTransientWorktree(claim, canonicalDigest({ foreign: true }), 1, "/tmp/candidate"))
      .toEqual({ status: "conflict", reason: "claim-id-mismatch" });
    expect(reserveDecomposeTransientWorktree(claim, claim.claimId, 1, "relative/path"))
      .toEqual({ status: "conflict", reason: "invalid-host-path" });
    expect(parseDecomposeTransientClaim({
      ...claim,
      generation: 0,
    })).toBeNull();
    expect(reserveDecomposeTransientWorktree({ ...claim, generation: 0 }, claim.claimId, 1, "/tmp/candidate"))
      .toEqual({ status: "conflict", reason: "malformed-claim" });
    expect(parseDecomposeTransientClaim({
      ...claim,
      candidateWorktree: canonicalDigest({ wrong: true }),
    })).toBeNull();

    const occupied = occupy();
    const retired = retireDecomposeTransientClaim(
      occupied.claim,
      occupied.claim.claimId,
      occupied.claim.generation,
      "discarded",
    );
    if (retired.status !== "retired") throw new Error("expected retirement");
    expect(releaseDecomposeTransientWorktree(
      retired.claim,
      retired.claim.claimId,
      retired.claim.generation,
      retired.claim.candidateWorktree,
      occupied.path,
      { registrationAbsent: true, markerAbsent: false, branchOccupationAbsent: true },
    )).toEqual({ status: "conflict", reason: "absence-unproven" });
  });
});
