/** Full session-slot contracts and evidence-qualified envelope routing. */

import { ErrandStateResultSchema } from "../../../src/lib/session-init/errand-state-schema.js";
import { WorkUnitStateResultSchema } from "../../../src/lib/session-init/work-unit-state-schema.js";
import { StaleWorktreeSweepResultSchema } from "../../../src/lib/session-init/stale-worktree-sweep-schema.js";
import { SessionInitUserValueSchema, UserSessionInitStatusResultSchema } from "../../../src/commands/user/session-init-schema.js";
import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";
import { buildBaseDistanceNotApplicable } from "../../../src/lib/git/base-distance.js";

import {
  SessionInitBaseBranchSyncValueViewSchema,
  SessionInitBaseDistanceValueSchema,
  SessionInitRetiredSubdirsValueViewSchema,
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

    assertSchemaAccepts(SessionInitBaseBranchSyncValueViewSchema, pending);
    assertSchemaRefuses(SessionInitBaseBranchSyncValueViewSchema, {
      ...pending,
      failureReason: "network",
    });
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
    assertSchemaAccepts(SessionInitBaseBranchSyncValueViewSchema, unreachable);
    assertSchemaRefuses(SessionInitBaseBranchSyncValueViewSchema, {
      ...unreachable,
      refreshRemedy: pending.refreshRemedy,
    });
  });

});

describe("user and recommendation routing views", () => {
  const user = {
    identity: "test-user", state: "clean", summary: "Current", actionHint: null, shouldPromptToPull: false,
    refState: "same", contentRelation: "equal", coherenceState: "partial-push", qualifier: "clean-at-current-head",
    localNoteFreshness: { state: "current-head", commit: "a".repeat(40), commitShort: "a".repeat(7), ancestorDistance: 0 },
    notesDrift: { direction: "modified", missingFiles: [], extraFiles: [], modifiedFiles: ["WORKING-MEMORY.md"] },
    loadNeeded: false, detailLines: ["kept"],
  };

  it("pins mapped user fields and retains sync detail payloads", () => {
    expect(UserSessionInitStatusResultSchema.parse(user)).toEqual(user);
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
    expect(UserSessionInitStatusResultSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    [SessionInitUserValueSchema, user],
    [SessionInitBaseDistanceValueSchema, { verdict: "clean" }],
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
    if (schema === SessionInitUserValueSchema) {
      expect(
        schema.safeParse({
          ...value,
          recommendedAction: "guess",
          recommendedPromptText: "kept",
        }).success,
      ).toBe(false);
    } else {
      assertSchemaRefuses(schema, {
        ...value,
        recommendedAction: "guess",
        recommendedPromptText: "kept",
      });
    }
  });

  it("pins drift-surface routing while preserving detail text", () => {
    const value = {
      ...user,
      notesDriftSurface: {
        direction: "edits",
        register: "caution",
      },
      recommendedAction: "surface",
      recommendedPromptText: "verbatim text",
    };
    expect(SessionInitUserValueSchema.parse(value)).toEqual(value);
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
          kind: "branched", worktreePath: "/tmp/alpha", branch: "feat/alpha",
          decision: {
            action: "blocked",
            reason: "uncommitted",
              },
        },
        {
          kind: "husk", worktreePath: "/tmp/alpha", branch: null, stampedBranch: "feat/alpha", completedWorkUnit: "alpha",
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
    };
    expect(StaleWorktreeSweepResultSchema.parse(value)).toEqual(value);
    expect(
      StaleWorktreeSweepResultSchema.safeParse({
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
          name: "alpha", branch: "feat/alpha", ageDays: 2,
        }],
        },
      nudge: { shouldNudge: false, markerPath: "kept", today: "2026-01-02" },
      warnings: [],
    };
    expect(WorkUnitStateResultSchema.parse(value)).toEqual(value);
    expect(
      WorkUnitStateResultSchema.safeParse({
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
          name: "alpha", branch: "feat/alpha", ageDays: 2,
          state: "mergeability-unavailable",
          behindBase: {
            status: "unavailable",
            remoteEvidence: "pending-fetch",
            reason: "base-object-pending-fetch",
          },
          mergeabilityGuidance: "Fetch remote evidence before deciding whether this work unit is mergeable.",
        }],
      },
      nudge: { shouldNudge: false, markerPath: null, today: "2026-01-02" }, warnings: [],
    };
    expect(WorkUnitStateResultSchema.safeParse(value).success).toBe(true);
    const missingGuidance = structuredClone(value);
    delete (missingGuidance.inFlight.workUnits[0] as { mergeabilityGuidance?: string }).mergeabilityGuidance;
    expect(WorkUnitStateResultSchema.safeParse(missingGuidance).success).toBe(false);
  });

  it("pins errand resume, classification, materialization, and nudge fields", () => {
    const value = {
      remoteEvidence: "exact",
      resume: { resumable: true, slug: "kept" },
      inFlight: { errands: [{ slug: "alpha", branch: "chore/alpha", ageDays: 2, state: "in-progress" }] },
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
      nudge: { shouldNudge: true, markerPath: "kept", today: "2026-01-02" },
      residue: [], warnings: [],
    };
    expect(ErrandStateResultSchema.parse(value)).toEqual(value);
    expect(
      ErrandStateResultSchema.safeParse({
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
    expect(StaleWorktreeSweepResultSchema.safeParse({
      remoteEvidence: "pending-fetch",
      worktrees: [{ kind: "branched", decision: { action: "removable" } }],
      renameMoves: [],
      retirements: [],
    }).success).toBe(false);
    expect(StaleWorktreeSweepResultSchema.safeParse({
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
    expect(ErrandStateResultSchema.safeParse({
      remoteEvidence: "not-applicable",
      resume: { resumable: false },
      inFlight: { errands: [{ state: "merged-cleanup" }] },
      materializable: { candidates: [] },
      nudge: { shouldNudge: false },
    }).success).toBe(false);
  });

  it("refuses partial payloads missing producer fields", () => {
    expect(
      WorkUnitStateResultSchema.safeParse({
        inFlight: { workUnits: [] },
        nudge: { shouldNudge: false },
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      StaleWorktreeSweepResultSchema,
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
      WorkUnitStateResultSchema,
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
      ErrandStateResultSchema,
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
      UserSessionInitStatusResultSchema,
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
      SessionInitUserValueSchema,
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
  ] as const)("rejects undeclared fields in the full slot schema %#", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("requires movement only on healthy base-distance readings", () => {
    const healthy = {
      ...buildBaseDistanceNotApplicable("skipped", "main"),
      verdict: "clean",
      movement: "disjoint",
      state: "clean",
      ahead: 0,
      behind: 0,
      baseOid: "a".repeat(40),
      headOid: "b".repeat(40),
      remoteEvidence: "exact",
      recommendedAction: "skip",
      recommendedPromptText: "",
    };
    assertSchemaAccepts(SessionInitBaseDistanceValueSchema, healthy);
    const { movement: _movement, ...missingMovement } = healthy;
    void _movement;
    assertSchemaRefuses(SessionInitBaseDistanceValueSchema, missingMovement);
    assertSchemaRefuses(SessionInitBaseDistanceValueSchema, {
      ...healthy,
      verdict: "skipped",
      state: "skipped",
      baseOid: null,
      remoteEvidence: "not-applicable",
    });
    assertSchemaAccepts(SessionInitBaseDistanceValueSchema, {
      ...buildBaseDistanceNotApplicable("no-remote", "main"),
      state: "remote-unavailable",
      unavailableReason: "remote-evidence-unreachable",
      remoteEvidence: "unreachable",
      failureReason: "network",
      recommendedAction: "skip",
      recommendedPromptText: "",
    });
  });
});
