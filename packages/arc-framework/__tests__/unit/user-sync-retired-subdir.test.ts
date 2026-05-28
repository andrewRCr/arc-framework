/**
 * Unit tests for `planRetiredSubdirReconcile` — the pure retired-subdir
 * reconciliation decision. A present per-WU subdir is reconcilable only when it
 * is absent from the recent-notes window AND its WU has shipped; the shipped
 * gate is what keeps a no-current-WU session from mass-reconciling in-flight
 * subdirs.
 */

import { describe, it, expect } from "vitest";

import {
  collectNotesWuNames,
  planRetiredSubdirReconcile,
  subdirsFromPaths,
} from "../../src/lib/user-sync/index.js";
import type { RecentNote } from "../../src/lib/user-sync/index.js";

/** Build a RecentNote whose content is a serialized manifest over the given file paths. */
function noteWithFiles(historyCommit: string, paths: string[]): RecentNote {
  const files = Object.fromEntries(paths.map((p) => [p, "x"]));
  return { historyCommit, content: JSON.stringify({ version: 2, files }) };
}

describe("planRetiredSubdirReconcile", () => {
  it("reconciles a present subdir that is absent from notes and shipped", () => {
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["old-wu"],
      notesWuNames: new Set(),
      shipped: new Set(["old-wu"]),
    });

    expect(plan.reconcile).toEqual(["old-wu"]);
    expect(plan.preserved).toEqual([]);
  });

  it("preserves a present subdir still carried in the recent-notes window, even when shipped", () => {
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["old-wu"],
      notesWuNames: new Set(["old-wu"]),
      shipped: new Set(["old-wu"]),
    });

    expect(plan.reconcile).toEqual([]);
    expect(plan.preserved).toEqual([{ subdir: "old-wu", reason: "still-in-notes" }]);
  });

  it("preserves a present subdir whose WU has not shipped", () => {
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["live-wu"],
      notesWuNames: new Set(),
      shipped: new Set(),
    });

    expect(plan.reconcile).toEqual([]);
    expect(plan.preserved).toEqual([{ subdir: "live-wu", reason: "not-shipped" }]);
  });

  it("reconciles only shipped subdirs when no current WU is resolved, preserving in-flight ones", () => {
    // Errand / main session: every local subdir looks "not the current WU" and
    // none are carried in this session's notes. The shipped gate is the only
    // thing standing between the reconcile and every in-flight subdir.
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["shipped-wu", "active-wu-a", "active-wu-b"],
      notesWuNames: new Set(),
      shipped: new Set(["shipped-wu"]),
    });

    expect(plan.reconcile).toEqual(["shipped-wu"]);
    expect(plan.preserved).toEqual([
      { subdir: "active-wu-a", reason: "not-shipped" },
      { subdir: "active-wu-b", reason: "not-shipped" },
    ]);
  });

  it("returns an empty plan for no local subdirs", () => {
    const plan = planRetiredSubdirReconcile({
      localSubdirs: [],
      notesWuNames: new Set(["anything"]),
      shipped: new Set(["anything"]),
    });

    expect(plan.reconcile).toEqual([]);
    expect(plan.preserved).toEqual([]);
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

describe("collectNotesWuNames", () => {
  it("unions per-WU subdir names across the recent-notes window, ignoring flat paths", () => {
    const names = collectNotesWuNames([
      noteWithFiles("h0", ["wu-a/SESSION-NOTES.md", "WORKING-MEMORY.md"]),
      noteWithFiles("h1", ["wu-b/SESSION-NOTES.md"]),
    ]);
    expect([...names].sort()).toEqual(["wu-a", "wu-b"]);
  });

  it("skips a note whose content is not a usable manifest", () => {
    const names = collectNotesWuNames([
      { historyCommit: "h0", content: "not json" },
      noteWithFiles("h1", ["wu-a/SESSION-NOTES.md"]),
    ]);
    expect([...names]).toEqual(["wu-a"]);
  });
});
