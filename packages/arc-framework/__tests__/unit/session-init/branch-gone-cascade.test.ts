import { describe, it, expect } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

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

type ResolveInput = Parameters<typeof resolveCascade>[0];

/** Resolve against `main` with exact evidence, so tier tests assert tier behavior alone. */
function cascade(
  input: Omit<ResolveInput, "baseBranch" | "evidence">
    & Partial<Pick<ResolveInput, "baseBranch" | "evidence">>,
) {
  return resolveCascade({ baseBranch: "main", evidence: { remoteEvidence: "exact" }, ...input });
}

describe("resolveCascade", () => {
  it("resolves to the single candidate when the worktree tier has exactly one", () => {
    const only = candidate({ branch: "feat/a", worktreePath: "/wt/a" });

    const result = cascade({
      worktreeCandidates: [only],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "resolved", remoteEvidence: "exact", candidate: only });
  });

  it("surfaces every candidate (no guess) when the worktree tier is ambiguous", () => {
    const a = candidate({ branch: "feat/a", worktreePath: "/wt/a" });
    const b = candidate({ branch: "feat/b", worktreePath: "/wt/b" });

    const result = cascade({
      worktreeCandidates: [a, b],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "surface", remoteEvidence: "exact", candidates: [a, b] });
  });

  it("trivially resolves the single-worktree case (one entry, one identity match)", () => {
    // The pre-worktree-adoption degenerate path: one in-flight worktree matches,
    // so it resolves through the same single-candidate arm — no special-casing.
    const lone = candidate({ branch: "feat/solo", worktreePath: "/wt/solo" });

    const result = cascade({
      worktreeCandidates: [lone],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "resolved", remoteEvidence: "exact", candidate: lone });
  });

  it("falls back to main when no tier has a candidate", () => {
    const result = cascade({
      worktreeCandidates: [],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "main-fallback", remoteEvidence: "exact", baseBranch: "main" });
  });

  it("returns pending instead of falling back when eligible advertised objects are missing", () => {
    const result = cascade({
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

    const result = cascade({
      worktreeCandidates: [],
      recentBranchCandidates: [recent],
    });

    expect(result).toEqual({ kind: "resolved", remoteEvidence: "exact", candidate: recent });
  });

  it("surfaces recent branches when the worktree tier is empty and several recent branches exist", () => {
    const r1 = candidate({ branch: "feat/r1" });
    const r2 = candidate({ branch: "feat/r2" });

    const result = cascade({
      worktreeCandidates: [],
      recentBranchCandidates: [r1, r2],
    });

    expect(result).toEqual({ kind: "surface", remoteEvidence: "exact", candidates: [r1, r2] });
  });

  it("prefers the worktree tier over recent branches — the first non-empty tier wins", () => {
    const wt = candidate({ branch: "feat/wt", worktreePath: "/wt/wt" });
    const recent1 = candidate({ branch: "feat/r1" });
    const recent2 = candidate({ branch: "feat/r2" });

    const result = cascade({
      worktreeCandidates: [wt],
      recentBranchCandidates: [recent1, recent2],
    });

    expect(result).toEqual({ kind: "resolved", remoteEvidence: "exact", candidate: wt });
  });

  it("carries the supplied base branch on the fallback outcome", () => {
    const result = cascade({
      worktreeCandidates: [],
      recentBranchCandidates: [],
      baseBranch: "trunk",
    });

    expect(result).toEqual({ kind: "main-fallback", remoteEvidence: "exact", baseBranch: "trunk" });
  });

  it.each([
    ["not-applicable", { remoteEvidence: "not-applicable" } as const],
    ["pending-fetch", { remoteEvidence: "pending-fetch" } as const],
    ["unreachable", { remoteEvidence: "unreachable", failureReason: "network" } as const],
  ])("surfaces the worktree tier as unproven under %s evidence", (_label, evidence) => {
    const only = candidate({ branch: "feat/a", worktreePath: "/wt/a" });

    // A candidate's disposition rests on proven merge status, so incomplete
    // evidence must never reach the exact singleton the resolved arm asserts.
    expect(cascade({ worktreeCandidates: [only], recentBranchCandidates: [], evidence }))
      .toEqual({ kind: "unproven", ...evidence, candidates: [only] });
  });

  it.each([
    ["not-applicable", { remoteEvidence: "not-applicable" } as const],
    ["unreachable", { remoteEvidence: "unreachable", failureReason: "network" } as const],
  ])("withholds the base fallback under %s evidence with no candidates", (_label, evidence) => {
    // An empty tier under a failed read is not a proven absence: the read
    // reveals no candidates either way, so the fallback is not concluded.
    expect(cascade({ worktreeCandidates: [], recentBranchCandidates: [], evidence }))
      .toEqual({ kind: "unproven", ...evidence, candidates: [] });
  });

  it("falls back to the base only under exact evidence", () => {
    expect(cascade({ worktreeCandidates: [], recentBranchCandidates: [] }))
      .toEqual({ kind: "main-fallback", remoteEvidence: "exact", baseBranch: "main" });
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
    { kind: "main-fallback", remoteEvidence: "exact", baseBranch: "main" },
    pendingResolution,
  ])("accepts each resolution kind", (resolution) => {
    assertSchemaAccepts(CascadeResolutionSchema, resolution);
  });

  it("requires a base branch on the fallback outcome", () => {
    assertSchemaRefuses(CascadeResolutionSchema, { kind: "main-fallback", remoteEvidence: "exact" });
  });

  it("allows switch candidates with or without a worktree path", () => {
    assertSchemaAccepts(CascadeCandidateSchema, switchCandidate);
    assertSchemaAccepts(CascadeCandidateSchema, { ...switchCandidate, worktreePath: "/wt/live" });
  });

  it.each(["removable", "external"] as const)("requires a worktree path for %s candidates", (proposedAction) => {
    assertSchemaRefuses(CascadeCandidateSchema, { branch: "feat/work", proposedAction });
  });

  it("requires at least two candidates for a surfaced choice", () => {
    assertSchemaRefuses(CascadeResolutionSchema, {
      kind: "surface",
      remoteEvidence: "exact",
      candidates: [switchCandidate],
    });
  });

  it("requires a positive pending count and the exact live-refresh remedy", () => {
    assertSchemaRefuses(CascadeResolutionSchema, { ...pendingResolution, pendingBranchCount: 0 });
    assertSchemaRefuses(CascadeResolutionSchema, {
      ...pendingResolution,
      refreshRemedy: { ...pendingResolution.refreshRemedy, argv: ["git", "fetch"] },
    });
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
    assertSchemaRefuses(CascadeResolutionSchema, resolution);
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

    assertSchemaAccepts(SessionInitRecoveryValueSchema, pending);
    assertSchemaRefuses(SessionInitRecoveryValueSchema, {
      ...pending,
      recommendedAction: "switch",
    });
    assertSchemaRefuses(SessionInitRecoveryValueSchema, {
      ...pending,
      recommendedPromptText: "",
    });
  });

  it("limits an exact switch candidate to automatic switch or a composed prompt", () => {
    const resolved = {
      kind: "resolved",
      remoteEvidence: "exact",
      candidate: { branch: "feat/live", proposedAction: "switch" },
      recommendedAction: "surface",
      recommendedPromptText: "Recover manually.",
    } as const;

    assertSchemaRefuses(SessionInitRecoveryValueSchema, resolved);
  });
});
