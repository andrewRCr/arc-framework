/** Unit coverage for deliberately thin session-envelope routing schemas. */

import { describe, expect, it } from "vitest";

import {
  BaseDistanceValueViewSchema,
  CurrentHuskAdvisoryViewSchema,
  DirtyStateValueViewSchema,
  ErrandStateValueViewSchema,
  StaleWorktreeSweepValueViewSchema,
  WorkUnitStateValueViewSchema,
  WorktreeRosterValueViewSchema,
  WorktreeSyncValueViewSchema,
} from "../../../src/commands/status/schema.js";

describe("shared git routing views", () => {
  it.each([
    [DirtyStateValueViewSchema, { state: "broken" }],
    [WorktreeSyncValueViewSchema, { state: "broken" }],
    [BaseDistanceValueViewSchema, { verdict: "broken" }],
    [WorktreeSyncValueViewSchema, { state: "diverged", supersession: { superseded: "yes" } }],
  ] as const)("rejects a malformed routing field", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("preserves unowned nested evidence and commit arrays", () => {
    const value = {
      state: "diverged",
      commits: [{ oid: "abc", subject: "kept" }],
      supersession: { superseded: true, localOnlyCommits: ["abc"] },
      evidence: { deep: { retained: true } },
    };

    expect(WorktreeSyncValueViewSchema.parse(value)).toEqual(value);
  });

  it("treats the roster as an object-only pass-through view", () => {
    const value = { entries: [{ arbitrary: "payload" }], warnings: ["kept"] };
    expect(WorktreeRosterValueViewSchema.parse(value)).toEqual(value);
    expect(WorktreeRosterValueViewSchema.safeParse([]).success).toBe(false);
  });
});

describe("deep advisory routing views", () => {
  it("pins current-husk subject and stamp kinds while retaining evidence", () => {
    const value = {
      subject: { kind: "work-unit", name: "alpha", retained: true },
      stamp: { kind: "current", evidence: { ref: "kept" } },
      worktreePath: "/wt/alpha",
    };
    expect(CurrentHuskAdvisoryViewSchema.parse(value)).toEqual(value);
    expect(CurrentHuskAdvisoryViewSchema.safeParse({ ...value, stamp: { kind: "future" } }).success).toBe(false);
  });

  it("pins stale-worktree report and cleanup decision discriminants", () => {
    const value = {
      worktrees: [
        { kind: "branched", decision: { action: "blocked", reason: "uncommitted", detail: "kept" } },
        {
          kind: "husk",
          subject: { kind: "work-unit", name: "alpha" },
          stamp: { kind: "legacy", authorization: "merged-preserved" },
          decision: { action: "outside", reason: "missing-stamp" },
        },
      ],
      warnings: [],
      retained: true,
    };
    expect(StaleWorktreeSweepValueViewSchema.parse(value)).toEqual(value);
    expect(
      StaleWorktreeSweepValueViewSchema.safeParse({
        worktrees: [{ kind: "branched", decision: { action: "blocked", reason: "wrong" } }],
      }).success,
    ).toBe(false);
  });

  it("pins work-unit classification, behind-base, and nudge fields", () => {
    const value = {
      inFlight: { workUnits: [{ state: "mergeable", behindBase: true, name: "alpha" }], retained: true },
      nudge: { shouldNudge: false, markerPath: "kept" },
      warnings: [],
    };
    expect(WorkUnitStateValueViewSchema.parse(value)).toEqual(value);
    expect(
      WorkUnitStateValueViewSchema.safeParse({
        inFlight: { workUnits: [{ state: "mergeable", behindBase: "yes" }] },
        nudge: { shouldNudge: false },
      }).success,
    ).toBe(false);
  });

  it("pins errand resume, classification, materialization, and nudge fields", () => {
    const value = {
      resume: { resumable: true, slug: "kept" },
      inFlight: { errands: [{ state: "in-progress", detail: "kept" }] },
      materializable: { candidates: [{ slug: "legacy title", branch: "chore/legacy" }] },
      nudge: { shouldNudge: true, markerPath: "kept" },
      residue: [],
    };
    expect(ErrandStateValueViewSchema.parse(value)).toEqual(value);
    expect(
      ErrandStateValueViewSchema.safeParse({
        ...value,
        materializable: { candidates: [{ slug: "", branch: "chore/legacy" }] },
      }).success,
    ).toBe(false);
  });

  it("accepts mapped-only payloads because the views are not full mirrors", () => {
    expect(DirtyStateValueViewSchema.safeParse({ state: "clean" }).success).toBe(true);
    expect(BaseDistanceValueViewSchema.safeParse({ verdict: "skipped" }).success).toBe(true);
    expect(WorkUnitStateValueViewSchema.safeParse({
      inFlight: { workUnits: [] },
      nudge: { shouldNudge: false },
    }).success).toBe(true);
  });
});
