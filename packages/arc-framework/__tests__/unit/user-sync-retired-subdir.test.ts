/**
 * Unit tests for `planRetiredSubdirReconcile` — the pure retired-subdir
 * reconciliation decision. A present per-WU subdir is reconcilable only when it
 * is absent from the recent-notes window AND its WU has shipped; the shipped
 * gate is what keeps a no-current-WU session from mass-reconciling in-flight
 * subdirs.
 */

import { describe, it, expect } from "vitest";

import { planRetiredSubdirReconcile } from "../../src/lib/user-sync/index.js";

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
