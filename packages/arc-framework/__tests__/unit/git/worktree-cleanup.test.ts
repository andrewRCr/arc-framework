/**
 * Unit tests for worktree cleanup gating.
 *
 * Covers the merged-check (`git merge-base --is-ancestor` — exit 0 → merged,
 * non-zero or error → not merged) and the pure decision that maps marker /
 * clean / merged / context signals to a removability state: `removable` only
 * when present + clean + (merged OR abandonment context); `blocked` when
 * present but dirty (or unmerged under shipped context); `external` when there
 * is no trustworthy marker.
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
  describe("shipped context", () => {
    it("is removable when present + clean + merged", () => {
      expect(
        decideWorktreeCleanup({ marker: present, clean: true, merged: true, context: "shipped" }),
      ).toEqual({ action: "removable" });
    });

    it("is blocked (uncommitted) when present + dirty, even if merged", () => {
      expect(
        decideWorktreeCleanup({ marker: present, clean: false, merged: true, context: "shipped" }),
      ).toEqual({ action: "blocked", reason: "uncommitted" });
    });

    it("is blocked (unmerged) when present + clean but unmerged — merge gate applies", () => {
      expect(
        decideWorktreeCleanup({ marker: present, clean: true, merged: false, context: "shipped" }),
      ).toEqual({ action: "blocked", reason: "unmerged" });
    });

    it("is external when there is no marker — externally managed", () => {
      expect(
        decideWorktreeCleanup({ marker: absent, clean: true, merged: true, context: "shipped" }),
      ).toEqual({ action: "external" });
    });

    it("is external when the marker is malformed — untrustworthy reads as the safe external default", () => {
      expect(
        decideWorktreeCleanup({ marker: malformed, clean: true, merged: true, context: "shipped" }),
      ).toEqual({ action: "external" });
    });
  });

  describe("abandonment context", () => {
    it("is removable when present + clean + unmerged — merge gate bypassed", () => {
      expect(
        decideWorktreeCleanup({
          marker: present,
          clean: true,
          merged: false,
          context: "abandonment",
        }),
      ).toEqual({ action: "removable" });
    });

    it("is still blocked (uncommitted) when present + dirty — clean gate still applies", () => {
      expect(
        decideWorktreeCleanup({
          marker: present,
          clean: false,
          merged: false,
          context: "abandonment",
        }),
      ).toEqual({ action: "blocked", reason: "uncommitted" });
    });

    it("is external when there is no marker — externally managed regardless of context", () => {
      expect(
        decideWorktreeCleanup({
          marker: absent,
          clean: true,
          merged: false,
          context: "abandonment",
        }),
      ).toEqual({ action: "external" });
    });
  });
});
