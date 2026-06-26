/**
 * Unit tests for `planRetiredSubdirReconcile` — the pure retired-subdir
 * reconciliation decision. A present per-WU subdir is reconcilable only when it
 * is absent from the recent-notes window AND its WU has shipped; the shipped
 * gate is what keeps a no-current-WU session from mass-reconciling in-flight
 * subdirs.
 */

import { describe, it, expect } from "vitest";

import {
  planRetiredSubdirReconcile,
  subdirsFromPaths,
} from "../../src/lib/user-sync/index.js";

describe("planRetiredSubdirReconcile", () => {
  it("reconciles a present subdir that is shipped and carries no drift", () => {
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["old-wu"],
      shipped: new Set(["old-wu"]),
      driftingSubdirs: new Set(),
    });

    expect(plan.reconcile).toEqual(["old-wu"]);
    expect(plan.preserved).toEqual([]);
  });

  it("preserves a shipped subdir that carries unpushed local drift", () => {
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["old-wu"],
      shipped: new Set(["old-wu"]),
      driftingSubdirs: new Set(["old-wu"]),
    });

    expect(plan.reconcile).toEqual([]);
    expect(plan.preserved).toEqual([{ subdir: "old-wu", reason: "has-drift" }]);
  });

  it("preserves a present subdir whose WU has not shipped", () => {
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["live-wu"],
      shipped: new Set(),
      driftingSubdirs: new Set(),
    });

    expect(plan.reconcile).toEqual([]);
    expect(plan.preserved).toEqual([{ subdir: "live-wu", reason: "not-shipped" }]);
  });

  it("preserves a not-shipped subdir as not-shipped even if it also drifts", () => {
    // Not-shipped is the stronger guard — a live WU's subdir is never reconciled,
    // and the reason reflects the dominant gate rather than incidental drift.
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["live-wu"],
      shipped: new Set(),
      driftingSubdirs: new Set(["live-wu"]),
    });

    expect(plan.preserved).toEqual([{ subdir: "live-wu", reason: "not-shipped" }]);
  });

  it("reconciles only shipped, drift-free subdirs when no current WU is resolved", () => {
    // Errand / main session: every local subdir looks "not the current WU". The
    // shipped gate confines the reconcile to genuinely-retired subdirs; the drift
    // gate spares one that still carries unpushed work.
    const plan = planRetiredSubdirReconcile({
      localSubdirs: ["shipped-clean", "shipped-dirty", "active-wu"],
      shipped: new Set(["shipped-clean", "shipped-dirty"]),
      driftingSubdirs: new Set(["shipped-dirty"]),
    });

    expect(plan.reconcile).toEqual(["shipped-clean"]);
    expect(plan.preserved).toEqual([
      { subdir: "shipped-dirty", reason: "has-drift" },
      { subdir: "active-wu", reason: "not-shipped" },
    ]);
  });

  it("returns an empty plan for no local subdirs", () => {
    const plan = planRetiredSubdirReconcile({
      localSubdirs: [],
      shipped: new Set(["anything"]),
      driftingSubdirs: new Set(),
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
