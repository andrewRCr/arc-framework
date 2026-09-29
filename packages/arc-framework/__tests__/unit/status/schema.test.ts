/** Unit coverage for deliberately thin session-envelope routing schemas. */

import { describe, expect, it } from "vitest";

import {
  BaseDistanceValueViewSchema,
  ErrandStateValueViewSchema,
  SessionInitBaseBranchSyncValueViewSchema,
  SessionInitBaseDistanceValueViewSchema,
  SessionInitRetiredSubdirsValueViewSchema,
  SessionInitUserValueViewSchema,
  StaleWorktreeSweepValueViewSchema,
  UserSessionInitValueViewSchema,
  WorkUnitStateValueViewSchema,
  WorktreeRosterValueViewSchema,
} from "../../../src/commands/status/schema.js";

describe("shared git routing views", () => {
  it("accepts evidence-qualified base-sync results and rejects crossed evidence fields", () => {
    const pending = {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: "main",
      checkout: { kind: "not-checked-out" },
      unavailableReason: "base-object-pending-fetch",
      refreshRemedy: {
        text: "Materialize and synchronize the local main branch.",
        argv: ["arc", "base", "sync", "--json"],
      },
      guidance: null,
      remoteEvidence: "pending-fetch",
      recommendedAction: "surface",
      recommendedPromptText: "Materialize and synchronize the local main branch. Run `arc base sync`.",
    };

    expect(SessionInitBaseBranchSyncValueViewSchema.safeParse(pending).success).toBe(true);
    expect(SessionInitBaseBranchSyncValueViewSchema.safeParse({
      ...pending,
      failureReason: "network",
    }).success).toBe(false);
    // A valid unreachable baseline, so the remedy assertion below varies one field
    // rather than relying on other crossed fields to force the rejection.
    const unreachable = {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: "main",
      checkout: { kind: "not-checked-out" },
      refreshRemedy: null,
      guidance: "Remote base evidence is unavailable (network).",
      remoteEvidence: "unreachable",
      failureReason: "network",
      recommendedAction: "surface",
      recommendedPromptText: "Remote base evidence is unavailable (network).",
    };
    expect(SessionInitBaseBranchSyncValueViewSchema.safeParse(unreachable).success).toBe(true);
    expect(SessionInitBaseBranchSyncValueViewSchema.safeParse({
      ...unreachable,
      refreshRemedy: pending.refreshRemedy,
    }).success).toBe(false);
  });

  it.each([
    [BaseDistanceValueViewSchema, { verdict: "broken" }],
  ] as const)("rejects a malformed routing field", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("treats the roster as an object-only pass-through view", () => {
    const value = {
      entries: [{ arbitrary: "payload" }],
      warnings: ["kept"],
    };
    expect(WorktreeRosterValueViewSchema.parse(value)).toEqual(value);
    expect(WorktreeRosterValueViewSchema.safeParse([]).success).toBe(false);
  });
});

describe("user and recommendation routing views", () => {
  const user = {
    state: "clean",
    refState: "same",
    contentRelation: "equal",
    coherenceState: "partial-push",
    qualifier: "clean-at-current-head",
    localNoteFreshness: { state: "current-head", retained: true },
    notesDrift: { direction: "modified", retained: true },
    loadNeeded: false,
    detailLines: ["kept"],
  };

  it("pins mapped user fields and retains sync detail payloads", () => {
    expect(UserSessionInitValueViewSchema.parse(user)).toEqual(user);
  });

  it.each([
    { ...user, state: "unknown" },
    { ...user, refState: "unknown" },
    { ...user, contentRelation: "unknown" },
    { ...user, coherenceState: "unknown" },
    { ...user, qualifier: "unknown" },
    { ...user, localNoteFreshness: { state: "unknown" } },
    { ...user, notesDrift: { direction: "unknown" } },
    { ...user, loadNeeded: "yes" },
  ])("rejects a malformed user routing field", (value) => {
    expect(UserSessionInitValueViewSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    [SessionInitUserValueViewSchema, user],
    [SessionInitBaseDistanceValueViewSchema, { verdict: "clean" }],
    [
      SessionInitBaseBranchSyncValueViewSchema,
      {
        state: "clean",
        ahead: 0,
        behind: 0,
        base: "main",
        checkout: { kind: "not-checked-out" },
      },
    ],
    [SessionInitRetiredSubdirsValueViewSchema, { candidates: [] }],
  ] as const)("rejects a corrupted recommendation action", (schema, value) => {
    expect(
      schema.safeParse({
        ...value,
        recommendedAction: "guess",
        recommendedPromptText: "kept",
      }).success,
    ).toBe(false);
  });

  it("pins drift-surface routing while preserving detail text", () => {
    const value = {
      ...user,
      notesDriftSurface: {
        direction: "edits",
        register: "caution",
        detail: "kept",
      },
      recommendedAction: "surface",
      recommendedPromptText: "verbatim text",
    };
    expect(SessionInitUserValueViewSchema.parse(value)).toEqual(value);
  });
});

describe("deep advisory routing views", () => {
  const passthroughUser = {
    state: "clean",
    refState: "same",
    contentRelation: "equal",
    coherenceState: "partial-push",
    qualifier: "clean-at-current-head",
    localNoteFreshness: { state: "current-head" },
    notesDrift: { direction: "modified" },
    loadNeeded: false,
  };

  it("pins stale-worktree report and cleanup decision discriminants", () => {
    const value = {
      remoteEvidence: "exact",
      worktrees: [
        {
          kind: "branched",
          decision: {
            action: "blocked",
            reason: "uncommitted",
            detail: "kept",
          },
        },
        {
          kind: "husk",
          subject: { kind: "work-unit", name: "alpha" },
          stamp: {
            kind: "legacy",
            authorization: "merged-preserved",
          },
          decision: { action: "outside", reason: "missing-stamp" },
        },
      ],
      renameMoves: [],
      retirements: [],
      warnings: [],
      retained: true,
    };
    expect(StaleWorktreeSweepValueViewSchema.parse(value)).toEqual(value);
    expect(
      StaleWorktreeSweepValueViewSchema.safeParse({
        worktrees: [
          {
            kind: "branched",
            decision: { action: "blocked", reason: "wrong" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("pins work-unit classification, behind-base, and nudge fields", () => {
    const value = {
      inFlight: {
        workUnits: [{
          state: "mergeable",
          behindBase: { status: "known", value: true, remoteEvidence: "exact" },
          name: "alpha",
        }],
        retained: true,
      },
      nudge: { shouldNudge: false, markerPath: "kept" },
      warnings: [],
    };
    expect(WorkUnitStateValueViewSchema.parse(value)).toEqual(value);
    expect(
      WorkUnitStateValueViewSchema.safeParse({
        inFlight: {
          workUnits: [{ state: "mergeable", behindBase: "yes" }],
        },
        nudge: { shouldNudge: false },
      }).success,
    ).toBe(false);
  });

  it("requires precomputed guidance for unavailable mergeability", () => {
    const value = {
      inFlight: {
        workUnits: [{
          state: "mergeability-unavailable",
          behindBase: {
            status: "unavailable",
            remoteEvidence: "pending-fetch",
            reason: "base-object-pending-fetch",
          },
          mergeabilityGuidance: "Fetch remote evidence before deciding whether this work unit is mergeable.",
        }],
      },
      nudge: { shouldNudge: false },
    };
    expect(WorkUnitStateValueViewSchema.safeParse(value).success).toBe(true);
    const missingGuidance = structuredClone(value);
    delete (missingGuidance.inFlight.workUnits[0] as { mergeabilityGuidance?: string }).mergeabilityGuidance;
    expect(WorkUnitStateValueViewSchema.safeParse(missingGuidance).success).toBe(false);
  });

  it("pins errand resume, classification, materialization, and nudge fields", () => {
    const value = {
      remoteEvidence: "exact",
      resume: { resumable: true, slug: "kept" },
      inFlight: { errands: [{ state: "in-progress", detail: "kept" }] },
      materializable: {
        candidates: [{
          slug: "exact-title",
          claimId: "c".repeat(32),
          branch: "chore/exact-title",
          expectedHead: "a".repeat(40),
          state: "paused",
          originEntry: "Exact title",
        }],
      },
      nudge: { shouldNudge: true, markerPath: "kept" },
      residue: [],
    };
    expect(ErrandStateValueViewSchema.parse(value)).toEqual(value);
    expect(
      ErrandStateValueViewSchema.safeParse({
        ...value,
        materializable: {
          candidates: [{
            slug: "",
            claimId: "c".repeat(32),
            branch: "chore/exact-title",
            expectedHead: "a".repeat(40),
            state: "paused",
            originEntry: "Exact title",
          }],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects cleanup authority when remote evidence is incomplete", () => {
    expect(StaleWorktreeSweepValueViewSchema.safeParse({
      remoteEvidence: "pending-fetch",
      worktrees: [{ kind: "branched", decision: { action: "removable" } }],
      renameMoves: [],
      retirements: [],
    }).success).toBe(false);
    expect(StaleWorktreeSweepValueViewSchema.safeParse({
      remoteEvidence: "unreachable",
      failureReason: "network",
      worktrees: [],
      renameMoves: [],
      retirements: [{
        status: "actionable",
        lifecycle: {
          subject: { slug: "retired", branch: "feat/retired" },
          transition: "abandon",
          cleanup: {
            branch: { status: "pending" },
            worktree: { status: "pending" },
            userWorkspace: { status: "pending" },
          },
          successorReadiness: { candidates: [], actionable: false, remedy: null },
        },
        teardown: { argv: ["arc", "teardown", "retired"], text: "arc teardown retired" },
      }],
    }).success).toBe(false);
    expect(ErrandStateValueViewSchema.safeParse({
      remoteEvidence: "not-applicable",
      resume: { resumable: false },
      inFlight: { errands: [{ state: "merged-cleanup" }] },
      materializable: { candidates: [] },
      nudge: { shouldNudge: false },
    }).success).toBe(false);
  });

  it("accepts mapped-only payloads because the views are not full mirrors", () => {
    expect(BaseDistanceValueViewSchema.safeParse({ verdict: "skipped" }).success).toBe(true);
    expect(
      WorkUnitStateValueViewSchema.safeParse({
        inFlight: { workUnits: [] },
        nudge: { shouldNudge: false },
      }).success,
    ).toBe(true);
  });

  it.each([
    [BaseDistanceValueViewSchema, { verdict: "clean", evidence: { deep: { retained: true } } }],
    [WorktreeRosterValueViewSchema, { entries: [{ evidence: { retained: true } }] }],
    [
      StaleWorktreeSweepValueViewSchema,
      {
        remoteEvidence: "exact",
        worktrees: [
          {
            kind: "branched",
            decision: {
              action: "blocked",
              reason: "uncommitted",
              evidence: { retained: true },
            },
            evidence: { deep: { retained: true } },
          },
        ],
        renameMoves: [],
        retirements: [],
        evidence: { deep: { retained: true } },
      },
    ],
    [
      WorkUnitStateValueViewSchema,
      {
        inFlight: {
          workUnits: [
            {
              state: "mergeable",
              behindBase: { status: "known", value: false, remoteEvidence: "exact" },
              evidence: { retained: true },
            },
          ],
          evidence: { retained: true },
        },
        nudge: { shouldNudge: false, evidence: { retained: true } },
        evidence: { deep: { retained: true } },
      },
    ],
    [
      ErrandStateValueViewSchema,
      {
        remoteEvidence: "exact",
        resume: { resumable: false, evidence: { retained: true } },
        inFlight: { errands: [], evidence: { retained: true } },
        materializable: {
          candidates: [],
          evidence: { retained: true },
        },
        nudge: { shouldNudge: false, evidence: { retained: true } },
        evidence: { deep: { retained: true } },
      },
    ],
    [
      UserSessionInitValueViewSchema,
      {
        ...passthroughUser,
        localNoteFreshness: {
          state: "current-head",
          evidence: { retained: true },
        },
        evidence: { deep: { retained: true } },
      },
    ],
    [
      SessionInitUserValueViewSchema,
      {
        ...passthroughUser,
        recommendedAction: "surface",
        recommendedPromptText: "kept",
        notesDriftSurface: {
          direction: "edits",
          register: "expected",
          evidence: { retained: true },
        },
        evidence: { deep: { retained: true } },
      },
    ],
    [
      SessionInitBaseDistanceValueViewSchema,
      {
        verdict: "clean",
        movement: "disjoint",
        state: "clean",
        ahead: 0,
        behind: 0,
        baseOid: "a".repeat(40),
        remoteEvidence: "exact",
        recommendedAction: "skip",
        recommendedPromptText: "",
        evidence: { deep: { retained: true } },
      },
    ],
  ] as const)("preserves legitimate unowned fields through thin schema %#", (schema, value) => {
    expect(schema.parse(value)).toEqual(value);
  });

  it("requires movement only on healthy base-distance readings", () => {
    const healthy = {
      verdict: "clean",
      movement: "disjoint",
      state: "clean",
      ahead: 0,
      behind: 0,
      baseOid: "a".repeat(40),
      remoteEvidence: "exact",
      recommendedAction: "skip",
      recommendedPromptText: "",
    };
    expect(SessionInitBaseDistanceValueViewSchema.safeParse(healthy).success).toBe(true);
    const { movement: _movement, ...missingMovement } = healthy;
    void _movement;
    expect(SessionInitBaseDistanceValueViewSchema.safeParse(missingMovement).success).toBe(false);
    expect(SessionInitBaseDistanceValueViewSchema.safeParse({
      ...healthy,
      verdict: "skipped",
      state: "skipped",
      baseOid: null,
      remoteEvidence: "not-applicable",
    }).success).toBe(false);
    expect(SessionInitBaseDistanceValueViewSchema.safeParse({
      ...healthy,
      verdict: "unavailable",
      state: "remote-unavailable",
      baseOid: null,
      headOid: null,
      movement: undefined,
      unavailableReason: "remote-evidence-unreachable",
      remoteEvidence: "unreachable",
      failureReason: "network",
    }).success).toBe(true);
  });
});
