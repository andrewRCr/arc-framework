import { describe, it, expect } from "vitest";

import {
  determineCandidateAction,
  resolveCascade,
  type CascadeCandidate,
} from "../../../src/lib/session-init/branch-gone-cascade.js";
import type { WorktreeMarkerReadResult } from "../../../src/lib/git/worktree-marker.js";

function candidate(overrides: Partial<CascadeCandidate> = {}): CascadeCandidate {
  return { branch: "feat/x", proposedAction: "switch", ...overrides };
}

describe("resolveCascade", () => {
  it("resolves to the single candidate when the worktree tier has exactly one", () => {
    const only = candidate({ branch: "feat/a", worktreePath: "/wt/a" });

    const result = resolveCascade({
      worktreeCandidates: [only],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "resolved", candidate: only });
  });

  it("surfaces every candidate (no guess) when the worktree tier is ambiguous", () => {
    const a = candidate({ branch: "feat/a", worktreePath: "/wt/a" });
    const b = candidate({ branch: "feat/b", worktreePath: "/wt/b" });

    const result = resolveCascade({
      worktreeCandidates: [a, b],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "surface", candidates: [a, b] });
  });

  it("trivially resolves the single-worktree case (one entry, one identity match)", () => {
    // The pre-worktree-adoption degenerate path: one in-flight worktree matches,
    // so it resolves through the same single-candidate arm — no special-casing.
    const lone = candidate({ branch: "feat/solo", worktreePath: "/wt/solo" });

    const result = resolveCascade({
      worktreeCandidates: [lone],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "resolved", candidate: lone });
  });

  it("falls back to main when no tier has a candidate", () => {
    const result = resolveCascade({
      worktreeCandidates: [],
      recentBranchCandidates: [],
    });

    expect(result).toEqual({ kind: "main-fallback" });
  });

  it("falls through to recent branches when the worktree tier is empty (single → resolved)", () => {
    const recent = candidate({ branch: "feat/recent" }); // no worktreePath — remote-only

    const result = resolveCascade({
      worktreeCandidates: [],
      recentBranchCandidates: [recent],
    });

    expect(result).toEqual({ kind: "resolved", candidate: recent });
  });

  it("surfaces recent branches when the worktree tier is empty and several recent branches exist", () => {
    const r1 = candidate({ branch: "feat/r1" });
    const r2 = candidate({ branch: "feat/r2" });

    const result = resolveCascade({
      worktreeCandidates: [],
      recentBranchCandidates: [r1, r2],
    });

    expect(result).toEqual({ kind: "surface", candidates: [r1, r2] });
  });

  it("prefers the worktree tier over recent branches — the first non-empty tier wins", () => {
    const wt = candidate({ branch: "feat/wt", worktreePath: "/wt/wt" });
    const recent1 = candidate({ branch: "feat/r1" });
    const recent2 = candidate({ branch: "feat/r2" });

    const result = resolveCascade({
      worktreeCandidates: [wt],
      recentBranchCandidates: [recent1, recent2],
    });

    expect(result).toEqual({ kind: "resolved", candidate: wt });
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
