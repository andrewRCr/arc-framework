/** Unit coverage for deliberately thin session-envelope routing schemas. */

import { describe, expect, it } from "vitest";

import {
  ActiveSessionInitValueViewSchema,
  BaseDistanceValueViewSchema,
  ConfigSessionInitValueViewSchema,
  CurrentHuskAdvisoryViewSchema,
  DirtyStateValueViewSchema,
  DomainRulesSessionInitValueViewSchema,
  ErrandStateValueViewSchema,
  ExtensionsSessionInitValueViewSchema,
  ReleaseRoutingValueViewSchema,
  SessionInitBaseBranchSyncValueViewSchema,
  SessionInitBaseDistanceValueViewSchema,
  SessionInitRetiredSubdirsValueViewSchema,
  SessionInitUserValueViewSchema,
  SessionInitWorktreeValueViewSchema,
  SessionRecoverWorktreeValueViewSchema,
  StaleWorktreeSweepValueViewSchema,
  UserSessionInitValueViewSchema,
  WorkUnitStateValueViewSchema,
  WorktreeIdentityViewSchema,
  WorktreeRosterValueViewSchema,
  WorktreeSyncValueViewSchema,
} from "../../../src/commands/status/schema.js";

describe("shared git routing views", () => {
  it.each([
    [DirtyStateValueViewSchema, { state: "broken" }],
    [WorktreeSyncValueViewSchema, { state: "broken" }],
    [WorktreeSyncValueViewSchema, { state: "clean", branch: 42 }],
    [BaseDistanceValueViewSchema, { verdict: "broken" }],
    [
      WorktreeSyncValueViewSchema,
      { state: "diverged", branch: "feat/test", supersession: { superseded: "yes" } },
    ],
  ] as const)("rejects a malformed routing field", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("preserves unowned nested evidence and commit arrays", () => {
    const value = {
      state: "diverged",
      branch: "feat/test",
      commits: [{ oid: "abc", subject: "kept" }],
      supersession: { superseded: true, localOnlyCommits: ["abc"] },
      evidence: { deep: { retained: true } },
    };

    expect(WorktreeSyncValueViewSchema.parse(value)).toEqual(value);
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

describe("command-owned routing views", () => {
  const config = {
    mode: "session-init",
    settings: {
      "session.remote_sync": "enabled",
      "session.init_pull.worktree": "prompt",
      "session.init_pull.notes": "always",
      "session.init_pull.base": "manual",
      "session.init_load.notes": "prompt",
      "user.notes_push": "on-sync",
      "branch.protection": "full",
      "pm.mode": "arc-in-git",
      "commit.format": "conventional",
      "commit.context_footer": "required",
      "commit.interlock": "on-workflow",
      "push.interlock": "on-sync",
    },
    warnings: ["kept"],
  };

  it("pins session modes and active routing values while retaining unowned fields", () => {
    expect(
      ExtensionsSessionInitValueViewSchema.parse({
        mode: "session-init",
        active: ["kept"],
      }),
    ).toEqual({ mode: "session-init", active: ["kept"] });
    expect(
      DomainRulesSessionInitValueViewSchema.parse({
        mode: "session-init",
        rules: [{ kept: true }],
      }),
    ).toEqual({ mode: "session-init", rules: [{ kept: true }] });
    const active = {
      mode: "session-init",
      layout: "full",
      resolution: "single",
      sessionType: "planning",
      planningStage: "draft-design",
      retained: true,
    };
    expect(ActiveSessionInitValueViewSchema.parse(active)).toEqual(active);
  });

  it.each([
    ["session.remote_sync", "sometimes"],
    ["session.init_pull.worktree", "always"],
    ["session.init_pull.notes", "invalid"],
    ["session.init_pull.base", "invalid"],
    ["session.init_load.notes", "invalid"],
    ["user.notes_push", "always"],
    ["branch.protection", "none"],
    ["pm.mode", "builtin"],
    ["commit.format", "unknown"],
    ["commit.context_footer", "optional"],
    ["commit.interlock", "on-commit"],
    ["push.interlock", "on-handoff"],
  ])("rejects invalid config policy %s", (key, value) => {
    expect(
      ConfigSessionInitValueViewSchema.safeParse({
        ...config,
        settings: { ...config.settings, [key]: value },
      }).success,
    ).toBe(false);
  });

  it("preserves unowned config fields", () => {
    expect(ConfigSessionInitValueViewSchema.parse(config)).toEqual(config);
  });

  it.each([
    {
      mode: "full",
      layout: "full",
      resolution: "single",
      sessionType: "execution",
      planningStage: null,
    },
    {
      mode: "session-init",
      layout: "nested",
      resolution: "single",
      sessionType: "execution",
      planningStage: null,
    },
    {
      mode: "session-init",
      layout: "full",
      resolution: "ambiguous",
      sessionType: "execution",
      planningStage: null,
    },
    {
      mode: "session-init",
      layout: "full",
      resolution: "single",
      sessionType: "unknown",
      planningStage: null,
    },
    {
      mode: "session-init",
      layout: "full",
      resolution: "single",
      sessionType: "planning",
      planningStage: "review",
    },
  ])("rejects an invalid active routing value", (value) => {
    expect(ActiveSessionInitValueViewSchema.safeParse(value).success).toBe(false);
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
    [SessionInitWorktreeValueViewSchema, { state: "clean", branch: "main", identity: { kind: "primary" } }],
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

describe("identity and release-routing views", () => {
  it.each([{ kind: "primary" }, { kind: "linked", path: "/wt/feature", retained: true }])(
    "accepts worktree identity $kind",
    (value) => expect(WorktreeIdentityViewSchema.parse(value)).toEqual(value),
  );
  it.each([{ kind: "other" }, { kind: "linked" }])("rejects malformed worktree identity", (value) => {
    expect(WorktreeIdentityViewSchema.safeParse(value).success).toBe(false);
  });

  it("pins all release routes while retaining rationale", () => {
    const value = {
      taskCommit: "wrapper",
      workflowCommit: "raw",
      workflowPush: "wrapper",
      rationale: { releaseOptedIn: true, retained: true },
    };
    expect(ReleaseRoutingValueViewSchema.parse(value)).toEqual(value);
  });

  it.each(["taskCommit", "workflowCommit", "workflowPush"])("rejects an invalid %s route", (key) => {
    expect(
      ReleaseRoutingValueViewSchema.safeParse({
        taskCommit: "raw",
        workflowCommit: "raw",
        workflowPush: "raw",
        [key]: "maybe",
      }).success,
    ).toBe(false);
  });
});

describe("deep advisory routing views", () => {
  const passthroughConfig = {
    mode: "session-init",
    settings: {
      "session.remote_sync": "enabled",
      "session.init_pull.worktree": "prompt",
      "session.init_pull.notes": "always",
      "session.init_pull.base": "manual",
      "session.init_load.notes": "prompt",
      "user.notes_push": "on-sync",
      "branch.protection": "full",
      "pm.mode": "arc-in-git",
      "commit.format": "conventional",
      "commit.context_footer": "required",
      "commit.interlock": "on-workflow",
      "push.interlock": "on-sync",
    },
  };
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

  it("pins current-husk subject and stamp kinds while retaining evidence", () => {
    const value = {
      subject: { kind: "work-unit", name: "alpha", retained: true },
      stamp: { kind: "current", evidence: { ref: "kept" } },
      worktreePath: "/wt/alpha",
    };
    expect(CurrentHuskAdvisoryViewSchema.parse(value)).toEqual(value);
    expect(
      CurrentHuskAdvisoryViewSchema.safeParse({
        ...value,
        stamp: { kind: "future" },
      }).success,
    ).toBe(false);
  });

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
    expect(DirtyStateValueViewSchema.safeParse({ state: "clean" }).success).toBe(true);
    expect(BaseDistanceValueViewSchema.safeParse({ verdict: "skipped" }).success).toBe(true);
    expect(
      WorkUnitStateValueViewSchema.safeParse({
        inFlight: { workUnits: [] },
        nudge: { shouldNudge: false },
      }).success,
    ).toBe(true);
  });

  it.each([
    [DirtyStateValueViewSchema, { state: "clean", evidence: { deep: { retained: true } } }],
    [
      WorktreeSyncValueViewSchema,
      {
        state: "diverged",
        branch: "feat/test",
        supersession: { superseded: true, commits: [{ oid: "kept" }] },
        evidence: { deep: { retained: true } },
      },
    ],
    [BaseDistanceValueViewSchema, { verdict: "clean", evidence: { deep: { retained: true } } }],
    [WorktreeRosterValueViewSchema, { entries: [{ evidence: { retained: true } }] }],
    [
      CurrentHuskAdvisoryViewSchema,
      {
        subject: { kind: "work-unit", evidence: { retained: true } },
        stamp: { kind: "legacy", evidence: { retained: true } },
        evidence: { deep: { retained: true } },
      },
    ],
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
      ExtensionsSessionInitValueViewSchema,
      {
        mode: "session-init",
        evidence: { deep: { retained: true } },
      },
    ],
    [
      ConfigSessionInitValueViewSchema,
      {
        ...passthroughConfig,
        settings: {
          ...passthroughConfig.settings,
          evidence: { deep: { retained: true } },
        },
        evidence: { deep: { retained: true } },
      },
    ],
    [
      ActiveSessionInitValueViewSchema,
      {
        mode: "session-init",
        layout: "full",
        resolution: "single",
        sessionType: "execution",
        planningStage: null,
        evidence: { deep: { retained: true } },
      },
    ],
    [
      DomainRulesSessionInitValueViewSchema,
      {
        mode: "session-init",
        rules: [{ evidence: { retained: true } }],
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
      SessionInitWorktreeValueViewSchema,
      {
        state: "clean",
        branch: "feat/test",
        identity: {
          kind: "linked",
          path: "/worktree",
          evidence: { retained: true },
        },
        recommendedAction: "skip",
        recommendedPromptText: "",
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
        recommendedAction: "skip",
        recommendedPromptText: "",
        evidence: { deep: { retained: true } },
      },
    ],
    [
      ReleaseRoutingValueViewSchema,
      {
        taskCommit: "raw",
        workflowCommit: "raw",
        workflowPush: "raw",
        rationale: { evidence: { retained: true } },
      },
    ],
    [
      WorktreeIdentityViewSchema,
      {
        kind: "linked",
        path: "/worktree",
        evidence: { deep: { retained: true } },
      },
    ],
    [
      SessionRecoverWorktreeValueViewSchema,
      {
        state: "clean",
        branch: "feat/test",
        remoteEvidence: "exact",
        identity: {
          kind: "linked",
          path: "/worktree",
          evidence: { retained: true },
        },
        evidence: { deep: { retained: true } },
      },
    ],
  ] as const)("preserves legitimate unowned fields through thin schema %#", (schema, value) => {
    expect(schema.parse(value)).toEqual(value);
  });
});
