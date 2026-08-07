import { describe, it, expect } from "vitest";

import {
  CascadeCandidateSchema,
  CascadeResolutionSchema,
  SessionInitRecoveryValueSchema,
  determineCandidateAction,
  resolveCascade,
  type CandidateAction,
  type CascadeCandidate,
} from "../../../src/lib/session-init/branch-gone-cascade.js";
import type { WorktreeMarkerReadResult } from "../../../src/lib/git/worktree-marker.js";

function candidate(
  overrides: { branch?: string; worktreePath?: string; proposedAction?: CandidateAction } = {},
): CascadeCandidate {
  return CascadeCandidateSchema.parse({ branch: "feat/x", proposedAction: "switch", ...overrides });
}

describe("resolveCascade", () => {
  it("resolves to the single candidate when the worktree tier has exactly one", () => {
    const only = candidate({ branch: "feat/a", worktreePath: "/wt/a" });

    const result = resolveCascade({
      worktreeCandidates: [only],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "resolved", remoteEvidence: "exact", candidate: only });
  });

  it("surfaces every candidate (no guess) when the worktree tier is ambiguous", () => {
    const a = candidate({ branch: "feat/a", worktreePath: "/wt/a" });
    const b = candidate({ branch: "feat/b", worktreePath: "/wt/b" });

    const result = resolveCascade({
      worktreeCandidates: [a, b],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "surface", remoteEvidence: "exact", candidates: [a, b] });
  });

  it("trivially resolves the single-worktree case (one entry, one identity match)", () => {
    // The pre-worktree-adoption degenerate path: one in-flight worktree matches,
    // so it resolves through the same single-candidate arm — no special-casing.
    const lone = candidate({ branch: "feat/solo", worktreePath: "/wt/solo" });

    const result = resolveCascade({
      worktreeCandidates: [lone],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "resolved", remoteEvidence: "exact", candidate: lone });
  });

  it("falls back to main when no tier has a candidate", () => {
    const result = resolveCascade({
      worktreeCandidates: [],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "main-fallback", remoteEvidence: "exact" });
  });

  it("returns pending instead of falling back when eligible advertised objects are missing", () => {
    const result = resolveCascade({
      worktreeCandidates: [],
      recentBranchCandidates: [],
      pendingBranchCount: 2,
    });

    expect(result).toEqual({
      kind: "pending",
      remoteEvidence: "pending-fetch",
      candidates: [],
      pendingBranchCount: 2,
      refreshRemedy: {
        argv: ["arc", "active", "in-flight", "--json"],
        text: "Refresh live in-flight branch evidence.",
      },
    });
  });

  it("falls through to recent branches when the worktree tier is empty (single → resolved)", () => {
    const recent = candidate({ branch: "feat/recent" }); // no worktreePath — remote-only

    const result = resolveCascade({
      worktreeCandidates: [],
      recentBranchCandidates: [recent],
    });

    expect(result).toEqual({ kind: "resolved", remoteEvidence: "exact", candidate: recent });
  });

  it("surfaces recent branches when the worktree tier is empty and several recent branches exist", () => {
    const r1 = candidate({ branch: "feat/r1" });
    const r2 = candidate({ branch: "feat/r2" });

    const result = resolveCascade({
      worktreeCandidates: [],
      recentBranchCandidates: [r1, r2],
    });

    expect(result).toEqual({ kind: "surface", remoteEvidence: "exact", candidates: [r1, r2] });
  });

  it("prefers the worktree tier over recent branches — the first non-empty tier wins", () => {
    const wt = candidate({ branch: "feat/wt", worktreePath: "/wt/wt" });
    const recent1 = candidate({ branch: "feat/r1" });
    const recent2 = candidate({ branch: "feat/r2" });

    const result = resolveCascade({
      worktreeCandidates: [wt],
      recentBranchCandidates: [recent1, recent2],
    });

    expect(result).toEqual({ kind: "resolved", remoteEvidence: "exact", candidate: wt });
  });
});

describe("determineCandidateAction", () => {
  const presentMarker: WorktreeMarkerReadResult = {
    kind: "present",
    marker: {
      spawnedByArc: true,
      wuName: "alpha",
      spawningIdentity: "andrew",
      createdAt: "2026-05-01T00:00:00Z",
    },
  };

  it("is removable for a shipped WU worktree (branch merged, marker present + clean)", () => {
    const action = determineCandidateAction({
      isMainOrAdmin: false,
      marker: presentMarker,
      clean: true,
      merged: true,
    });

    expect(action).toBe("removable");
  });

  it("proposes a switch for a main / admin worktree regardless of merge state", () => {
    const action = determineCandidateAction({
      isMainOrAdmin: true,
      marker: { kind: "absent" },
      clean: true,
      merged: false,
    });

    expect(action).toBe("switch");
  });

  it("is external for a WU worktree with no marker", () => {
    const action = determineCandidateAction({
      isMainOrAdmin: false,
      marker: { kind: "absent" },
      clean: true,
      merged: true,
    });

    expect(action).toBe("external");
  });

  it("proposes a switch for a live WU worktree (clean but unmerged)", () => {
    const action = determineCandidateAction({
      isMainOrAdmin: false,
      marker: presentMarker,
      clean: true,
      merged: false,
    });

    expect(action).toBe("switch");
  });

  it("proposes a switch for a WU worktree with uncommitted changes", () => {
    const action = determineCandidateAction({
      isMainOrAdmin: false,
      marker: presentMarker,
      clean: false,
      merged: true,
    });

    expect(action).toBe("switch");
  });

  it("proposes a switch for a WU worktree with unsafe ignored user surfaces", () => {
    const action = determineCandidateAction({
      isMainOrAdmin: false,
      marker: presentMarker,
      clean: true,
      userSurfacesSafe: false,
      merged: true,
    });

    expect(action).toBe("switch");
  });

  it("is external for a malformed marker", () => {
    const action = determineCandidateAction({
      isMainOrAdmin: false,
      marker: { kind: "malformed", message: "bad json", path: "/wt/.arc/system/.internal/worktree-marker.json" },
      clean: true,
      merged: true,
    });

    expect(action).toBe("external");
  });
});

describe("CascadeResolutionSchema", () => {
  const switchCandidate = candidate({ branch: "feat/live" });
  const removableCandidate = candidate({
    branch: "feat/shipped",
    worktreePath: "/wt/shipped",
    proposedAction: "removable",
  });
  const pendingResolution = {
    kind: "pending",
    remoteEvidence: "pending-fetch",
    candidates: [switchCandidate],
    pendingBranchCount: 1,
    refreshRemedy: {
      argv: ["arc", "active", "in-flight", "--json"],
      text: "Refresh live in-flight branch evidence.",
    },
  } as const;

  it.each([
    { kind: "resolved", remoteEvidence: "exact", candidate: switchCandidate },
    { kind: "surface", remoteEvidence: "exact", candidates: [switchCandidate, removableCandidate] },
    { kind: "main-fallback", remoteEvidence: "exact" },
    pendingResolution,
  ])("accepts each resolution kind", (resolution) => {
    expect(CascadeResolutionSchema.safeParse(resolution).success).toBe(true);
  });

  it("allows switch candidates with or without a worktree path", () => {
    expect(CascadeCandidateSchema.safeParse(switchCandidate).success).toBe(true);
    expect(CascadeCandidateSchema.safeParse({ ...switchCandidate, worktreePath: "/wt/live" }).success).toBe(true);
  });

  it.each(["removable", "external"] as const)("requires a worktree path for %s candidates", (proposedAction) => {
    expect(CascadeCandidateSchema.safeParse({ branch: "feat/work", proposedAction }).success).toBe(false);
  });

  it("requires at least two candidates for a surfaced choice", () => {
    expect(CascadeResolutionSchema.safeParse({
      kind: "surface",
      remoteEvidence: "exact",
      candidates: [switchCandidate],
    }).success).toBe(false);
  });

  it("requires a positive pending count and the exact live-refresh remedy", () => {
    expect(CascadeResolutionSchema.safeParse({ ...pendingResolution, pendingBranchCount: 0 }).success).toBe(false);
    expect(CascadeResolutionSchema.safeParse({
      ...pendingResolution,
      refreshRemedy: { ...pendingResolution.refreshRemedy, argv: ["git", "fetch"] },
    }).success).toBe(false);
  });

  it.each([
    { kind: "resolved", remoteEvidence: "exact", candidate: switchCandidate, candidates: [switchCandidate] },
    {
      kind: "surface",
      remoteEvidence: "exact",
      candidates: [switchCandidate, removableCandidate],
      candidate: switchCandidate,
    },
    { kind: "main-fallback", remoteEvidence: "exact", candidate: switchCandidate },
  ])("rejects fields from another resolution kind", (resolution) => {
    expect(CascadeResolutionSchema.safeParse(resolution).success).toBe(false);
  });
});

describe("SessionInitRecoveryValueSchema", () => {
  it("accepts only a prompt with explicit guidance for pending evidence", () => {
    const pending = {
      kind: "pending",
      remoteEvidence: "pending-fetch",
      candidates: [],
      pendingBranchCount: 1,
      refreshRemedy: {
        argv: ["arc", "active", "in-flight", "--json"],
        text: "Refresh live in-flight branch evidence.",
      },
      recommendedAction: "prompt",
      recommendedPromptText: "Refresh live evidence, or recover manually.",
    } as const;

    expect(SessionInitRecoveryValueSchema.safeParse(pending).success).toBe(true);
    expect(SessionInitRecoveryValueSchema.safeParse({
      ...pending,
      recommendedAction: "switch",
    }).success).toBe(false);
    expect(SessionInitRecoveryValueSchema.safeParse({
      ...pending,
      recommendedPromptText: "",
    }).success).toBe(false);
  });

  it("limits an exact switch candidate to automatic switch or a composed prompt", () => {
    const resolved = {
      kind: "resolved",
      remoteEvidence: "exact",
      candidate: { branch: "feat/live", proposedAction: "switch" },
      recommendedAction: "surface",
      recommendedPromptText: "Recover manually.",
    } as const;

    expect(SessionInitRecoveryValueSchema.safeParse(resolved).success).toBe(false);
  });
});
