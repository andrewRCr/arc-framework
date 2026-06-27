/**
 * Unit tests for `planRetiredSubdirReconcile` — the pure retired-subdir
 * reconciliation decision. A present per-WU subdir is reconcilable exactly when
 * its WU has shipped; the shipped gate is what keeps a no-current-WU session from
 * mass-reconciling in-flight subdirs. Removal is recoverable (the caller backs up
 * first), so a shipped subdir reconciles unconditionally — drift no longer gates.
 */

import { describe, it, expect } from "vitest";

import {
  planRetiredSubdirReconcile,
  stashedFilesInSubdir,
  subdirsFromPaths,
} from "../../src/lib/user-sync/index.js";

describe("planRetiredSubdirReconcile", () => {
  it("reconciles a present subdir that is shipped", () => {
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["old-wu"],
      shipped: new Set(["old-wu"]),
    });

    expect(plan.reconcile).toEqual(["old-wu"]);
    expect(plan.preserved).toEqual([]);
  });

  it("reconciles a shipped subdir unconditionally — local content does not spare it", () => {
    // A shipped WU is closed and removal is backed up, so even a subdir the
    // operator edited or stashed files in is reconciled (the backup is the net).
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["old-wu"],
      shipped: new Set(["old-wu"]),
    });

    expect(plan.reconcile).toEqual(["old-wu"]);
    expect(plan.preserved).toEqual([]);
  });

  it("preserves a present subdir whose WU has not shipped", () => {
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["live-wu"],
      shipped: new Set(),
    });

    expect(plan.reconcile).toEqual([]);
    expect(plan.preserved).toEqual([{ subdir: "live-wu", reason: "not-shipped" }]);
  });

  it("reconciles every shipped subdir, preserving only not-shipped, with no current WU", () => {
    // Errand / main session: every local subdir looks "not the current WU". The
    // shipped gate confines the reconcile to genuinely-retired subdirs; a live WU
    // (not shipped) is preserved.
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["shipped-a", "shipped-b", "active-wu"],
      shipped: new Set(["shipped-a", "shipped-b"]),
    });

    expect(plan.reconcile).toEqual(["shipped-a", "shipped-b"]);
    expect(plan.preserved).toEqual([{ subdir: "active-wu", reason: "not-shipped" }]);
  });

  it("returns an empty plan for no local subdirs", () => {
    const plan = planRetiredSubdirReconcile({
      localSubdirs: [],
      shipped: new Set(["anything"]),
    });

    expect(plan.reconcile).toEqual([]);
    expect(plan.preserved).toEqual([]);
  });
});

describe("stashedFilesInSubdir", () => {
  it("returns the non-ARC basenames a subdir carries", () => {
    const stashed = stashedFilesInSubdir(
      ["old-wu/SESSION-NOTES.md", "old-wu/scratch.py", "old-wu/notes/query.sql", "other-wu/x.txt"],
      "old-wu",
    );

    expect(stashed).toEqual(["scratch.py", "query.sql"]);
  });

  it("is empty when the subdir holds only ARC's own SESSION-NOTES", () => {
    expect(stashedFilesInSubdir(["old-wu/SESSION-NOTES.md"], "old-wu")).toEqual([]);
  });
});

describe("subdirsFromPaths", () => {
  it("extracts distinct per-WU subdir names, ignoring flat and dot-prefixed paths", () => {
    expect(
      subdirsFromPaths([
        "wu-a/SESSION-NOTES.md",
        "wu-a/drafts/idea.md",
        "wu-b/SESSION-NOTES.md",
        "WORKING-MEMORY.md",
        ".internal/.sync-state.json",
      ]),
    ).toEqual(["wu-a", "wu-b"]);
  });

  it("returns an empty array when no path carries a subdir", () => {
    expect(subdirsFromPaths(["WORKING-MEMORY.md", "USER-INBOX.md"])).toEqual([]);
  });
});
