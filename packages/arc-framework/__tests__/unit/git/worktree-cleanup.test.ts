/**
 * Unit tests for worktree cleanup gating.
 *
 * Covers the merged-check (`git merge-base --is-ancestor` — exit 0 → merged,
 * non-zero or error → not merged) and the pure decision that maps a marker
 * read result plus clean/merged signals to a cleanup action: offer-remove only
 * when present + clean + merged; surface (never auto-remove) when present but
 * dirty or unmerged; advisory when there is no trustworthy marker.
 */

import { describe, it, expect } from "vitest";

import {
  isBranchMerged,
  decideWorktreeCleanup,
} from "../../../src/lib/git/worktree-cleanup.js";
import type {
  GitExec,
  WorktreeMarker,
  WorktreeMarkerReadResult,
} from "../../../src/lib/git/index.js";

const marker: WorktreeMarker = {
  spawnedByArc: true,
  wuName: "worktree-foundation",
  spawningIdentity: "andrew",
  createdAt: "2026-05-25T00:00:00.000Z",
};

const present: WorktreeMarkerReadResult = { kind: "present", marker };
const absent: WorktreeMarkerReadResult = { kind: "absent" };
const malformed: WorktreeMarkerReadResult = { kind: "malformed", message: "bad", path: "/x" };

describe("isBranchMerged", () => {
  function execAncestor(isAncestor: boolean): GitExec {
    return async (cmd, args) => {
      expect(cmd).toBe("git");
      expect(args).toEqual(["merge-base", "--is-ancestor", "feat/foo", "main"]);
      if (isAncestor) return { stdout: "", stderr: "" };
      const err = Object.assign(new Error("not an ancestor"), { code: 1 });
      throw err;
    };
  }

  it("reports merged when the branch is an ancestor of the target (exit 0)", async () => {
    expect(await isBranchMerged({ exec: execAncestor(true), branch: "feat/foo", target: "main" })).toBe(true);
  });

  it("reports not merged when the branch is not an ancestor (non-zero exit)", async () => {
    expect(await isBranchMerged({ exec: execAncestor(false), branch: "feat/foo", target: "main" })).toBe(false);
  });

  it("treats an exec failure as not merged — uncertainty never produces a removal offer", async () => {
    const exec: GitExec = () => Promise.reject(new Error("fatal: bad revision"));
    expect(await isBranchMerged({ exec, branch: "feat/foo", target: "main" })).toBe(false);
  });
});

describe("decideWorktreeCleanup", () => {
  it("offers removal when present + clean + merged", () => {
    expect(decideWorktreeCleanup({ marker: present, clean: true, merged: true })).toEqual({
      action: "offer-remove",
    });
  });

  it("surfaces (never auto-removes) when present + dirty, even if merged", () => {
    expect(decideWorktreeCleanup({ marker: present, clean: false, merged: true })).toEqual({
      action: "surface",
      reason: "uncommitted",
    });
  });

  it("surfaces (never auto-removes) when present + clean but unmerged (e.g. unpushed commits)", () => {
    expect(decideWorktreeCleanup({ marker: present, clean: true, merged: false })).toEqual({
      action: "surface",
      reason: "unmerged",
    });
  });

  it("advises only when there is no marker — externally managed", () => {
    expect(decideWorktreeCleanup({ marker: absent, clean: true, merged: true })).toEqual({
      action: "advisory",
    });
  });

  it("advises when the marker is malformed — untrustworthy reads as the safe external default", () => {
    expect(decideWorktreeCleanup({ marker: malformed, clean: true, merged: true })).toEqual({
      action: "advisory",
    });
  });
});
