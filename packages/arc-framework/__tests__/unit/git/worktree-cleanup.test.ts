/**
 * Unit tests for worktree cleanup gating — the pure decision that maps marker /
 * clean / merged / context signals to a removability state: `removable` only when
 * present + clean + (merged OR abandonment context); `blocked` when present but
 * dirty (or unmerged under shipped context); `external` when there is no
 * trustworthy marker. (The `merged` signal itself comes from the shared
 * `isLandedInBase` oracle, covered in `branch-containment.test.ts`.)
 */

import { describe, it, expect } from "vitest";

import {
  decideHuskCleanup,
  decideWorktreeCleanup,
} from "../../../src/lib/git/worktree-cleanup.js";
import type { WorktreeMarker, WorktreeMarkerReadResult } from "../../../src/lib/git/index.js";

const marker: WorktreeMarker = {
  spawnedByArc: true,
  wuName: "worktree-foundation",
  spawningIdentity: "andrew",
  createdAt: "2026-05-25T00:00:00.000Z",
};

const present: WorktreeMarkerReadResult = { kind: "present", marker };
const absent: WorktreeMarkerReadResult = { kind: "absent" };
const malformed: WorktreeMarkerReadResult = { kind: "malformed", message: "bad", path: "/x" };

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

    it("is blocked when ignored identity-global user surfaces cannot be reconciled", () => {
      expect(
        decideWorktreeCleanup({
          marker: present,
          clean: true,
          userSurfacesSafe: false,
          merged: true,
          context: "shipped",
        }),
      ).toEqual({ action: "blocked", reason: "user-surfaces" });
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

describe("decideHuskCleanup", () => {
  const stampedMarker: WorktreeMarkerReadResult = {
    kind: "present",
    marker: {
      ...marker,
      husk: {
        sha: "0123456789abcdef0123456789abcdef01234567",
        at: "2026-07-14T20:00:00.000Z",
        subject: { kind: "work-unit", name: "worktree-foundation" },
        branch: "feat/worktree-foundation",
      },
    },
  };

  it("is removable only when a clean husk remains at its stamped HEAD", () => {
    expect(
      decideHuskCleanup({
        marker: stampedMarker,
        clean: true,
        head: "0123456789abcdef0123456789abcdef01234567",
      }),
    ).toEqual({ action: "removable" });
  });

  it("distinguishes dirty and moved-HEAD refusals", () => {
    expect(
      decideHuskCleanup({
        marker: stampedMarker,
        clean: false,
        head: "0123456789abcdef0123456789abcdef01234567",
      }),
    ).toEqual({ action: "blocked", reason: "uncommitted" });
    expect(decideHuskCleanup({ marker: stampedMarker, clean: true, head: "moved" })).toEqual({
      action: "blocked",
      reason: "head-moved",
    });
  });

  it.each([
    [absent, "untrusted-marker"],
    [malformed, "untrusted-marker"],
    [present, "missing-stamp"],
  ] as const)("keeps untrusted and unstamped markers outside the husk path", (inputMarker, reason) => {
    expect(decideHuskCleanup({ marker: inputMarker, clean: true, head: "abc" })).toEqual({
      action: "outside",
      reason,
    });
  });
});
