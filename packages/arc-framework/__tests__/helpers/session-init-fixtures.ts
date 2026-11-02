/** Shared probe builders producing validated session-init envelopes. */

import { vi } from "vitest";
import type { SessionInitProbes } from "../../src/commands/status.js";
import type { ActiveSessionInitResult } from "../../src/commands/active/types.js";
import type { ConfigSessionInitResult } from "../../src/commands/config/types.js";
import type { DomainRulesSessionInitResult } from "../../src/commands/constitution/types.js";
import type { UserSessionInitStatusResult } from "../../src/commands/user/types.js";
import type { DirtyStateResult } from "../../src/lib/git/dirty-state.js";
import type { WorktreeSnapshotAnalysisResult, WorktreeSyncStatusResult } from "../../src/lib/git/worktree-sync.js";
import type { BaseDistanceStatusResult } from "../../src/lib/git/base-distance.js";
import {
  BaseBranchSnapshotAnalysisResultSchema,
  type BaseBranchSnapshotAnalysisResult,
} from "../../src/lib/git/base-branch-sync.js";
import type { SupersessionResult } from "../../src/lib/git/supersession.js";
import type { WorktreeRosterResult } from "../../src/lib/git/worktree-roster.js";
import type { WorktreeIdentity } from "../../src/lib/git/worktree-identity.js";
import type { CascadeResolution } from "../../src/lib/session-init/branch-gone-cascade.js";
import type { StaleWorktreeSweepResult } from "../../src/lib/session-init/stale-worktree-sweep.js";
import type { OrphanBranchSweepResult } from "../../src/lib/session-init/orphan-branch-sweep.js";
import { type RetiredSubdirDetectionResult } from "../../src/lib/session-init/retired-subdir-detection.js";
import type { ErrandStalenessSweepResult } from "../../src/lib/session-init/errand-staleness-sweep.js";
import type { ErrandStateResult } from "../../src/lib/session-init/errand-state.js";
import {
  MaterializableWorkUnitDiscoveryResultSchema,
  type MaterializableWorkUnitDiscoveryResult,
} from "../../src/lib/session-init/materializable-work-units.js";
import type { WorkUnitStateResult } from "../../src/lib/session-init/work-unit-state.js";
import type { HooksPathSessionAdvisory } from "../../src/lib/session-init/hooks-path-advisory.js";
import type { InboxStateResult } from "../../src/lib/session-init/inbox-state.js";
import type { PartialPushMarkerSurfaceResult } from "../../src/lib/session-init/partial-push-marker-surface.js";
import type { ReleaseRoutingValue } from "../../src/lib/release/routing.js";
import type { TaskListCursorResult } from "../../src/lib/task-list/cursor.js";
import type { TaskListCursorFileResult } from "../../src/lib/task-list/file-cursor.js";
import type { DerivedLocusFrame } from "../../src/lib/locus/derived-reader.js";
import { assertLoadSetPath, resolveLoadSetManifest } from "../../src/lib/load-set/projection.js";
import { worktreeStateEvidence } from "./worktree-evidence.js";
import { runSessionInitStatus } from "../../src/commands/status.js";
import type { RunSessionInitStatusOptions, SessionInitProbeResult } from "../../src/commands/status.js";
import { assertSessionInitProbeResult } from "../../src/commands/status/schema.js";

export function materializableResult(
  candidates: Array<{ name: string; branch: string }>,
): MaterializableWorkUnitDiscoveryResult {
  return MaterializableWorkUnitDiscoveryResultSchema.parse({
    candidates,
    remoteEvidence: "exact",
    pendingBranchCount: 0,
    refreshRemedy: null,
  });
}

export function userSessionInit(
  overrides: Partial<UserSessionInitStatusResult> = {},
): UserSessionInitStatusResult {
  return {
    identity: "andrew",
    state: "clean",
    summary: "andrew: session-init remote state clean",
    detailLines: ["Remote notes match local notes."],
    actionHint: null,
    shouldPromptToPull: false,
    ...overrides,
  };
}

export function worktreeSync(
  overrides: Partial<WorktreeSyncStatusResult> = {},
): WorktreeSnapshotAnalysisResult {
  return passiveWorktreeSync(overrides);
}

export function passiveWorktreeSync(
  overrides: Partial<Omit<WorktreeSyncStatusResult, "failureReason">> & {
    failureReason?: Extract<
      WorktreeSnapshotAnalysisResult,
      { remoteEvidence: "unreachable" }
    >["failureReason"];
  } = {},
): WorktreeSnapshotAnalysisResult {
  const value: Omit<WorktreeSyncStatusResult, "failureReason"> & {
    failureReason?: Extract<
      WorktreeSnapshotAnalysisResult,
      { remoteEvidence: "unreachable" }
    >["failureReason"];
  } = { state: "clean", ahead: 0, behind: 0, branch: "main", ...overrides };
  const { failureReason, ...base } = value;
  if (value.state === "remote-unavailable") {
    return failureReason === undefined
      ? { ...base, remoteEvidence: "pending-fetch" }
      : { ...base, remoteEvidence: "unreachable", failureReason };
  }
  const remoteEvidence = worktreeStateEvidence(value.state);
  return { ...base, remoteEvidence };
}

export function worktreeIdentity(value: WorktreeIdentity = { kind: "primary" }): WorktreeIdentity {
  return value;
}

export function baseDistance(
  overrides: Partial<Extract<BaseDistanceStatusResult, { verdict: "clean" | "reconcile" }>> = {},
): Awaited<ReturnType<SessionInitProbes["baseDistance"]>> {
  const value: BaseDistanceStatusResult = {
    mode: "advisory", verdict: "clean", state: "clean", ahead: 0, behind: 0,
    base: "main", baseOid: "a".repeat(40),
    movement: "disjoint",
    integrationEvidence: {
      coverage: "complete", scannedCommitCount: 0, events: [],
      unclassifiedCommitCount: 0, truncated: false, limitations: [],
    },
    overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
    register: null,
    ...overrides,
    headOid: overrides.headOid ?? "b".repeat(40),
  };
  const { failureReason, ...result } = value;
  void failureReason;
  return { ...result, remoteEvidence: "exact" };
}

export function baseBranchSync(
  overrides: Record<string, unknown> = {},
): BaseBranchSnapshotAnalysisResult {
  return BaseBranchSnapshotAnalysisResultSchema.parse({
    state: "clean",
    ahead: 0,
    behind: 0,
    base: "main",
    checkout: { kind: "not-checked-out" },
    refreshRemedy: null,
    guidance: null,
    remoteEvidence: "exact",
    ...overrides,
  });
}

export function supersessionResult(
  overrides: Partial<SupersessionResult> = {},
): SupersessionResult {
  return { superseded: false, supersededCommits: [], novelCommits: [], ...overrides };
}

export function rosterResult(overrides: Partial<WorktreeRosterResult> = {}): WorktreeRosterResult {
  return { entries: [], warnings: [], ...overrides };
}

export function errandStateResult(
  overrides: Partial<Omit<ErrandStateResult, "remoteEvidence" | "failureReason">> = {},
): ErrandStateResult {
  return {
    remoteEvidence: "not-applicable",
    resume: { resumable: false, slug: null },
    inFlight: { errands: [] },
    materializable: { candidates: [] },
    residue: [],
    nudge: { shouldNudge: false, markerPath: null, today: "2026-06-01" },
    warnings: [],
    ...overrides,
  };
}

export function workUnitStateResult(overrides: Partial<WorkUnitStateResult> = {}): WorkUnitStateResult {
  return {
    inFlight: { workUnits: [] },
    nudge: { shouldNudge: false, markerPath: null, today: "2026-06-01" },
    warnings: [],
    ...overrides,
  };
}

export function configSessionInit(
  overrides: Partial<ConfigSessionInitResult> = {},
): ConfigSessionInitResult {
  return {
    mode: "session-init",
    settings: {
      "session.remote_sync": "enabled",
      "session.init_pull.worktree": "prompt",
      "session.init_pull.notes": "prompt",
      "session.init_pull.base": "prompt",
      "session.init_load.notes": "prompt",
      "user.notes_push": "on-sync",
      "branch.protection": "partial",
      "pm.mode": "none",
      "commit.format": "conventional",
      "commit.context_footer": "required",
      "commit.interlock": "manual",
      "push.interlock": "manual",
    },
    defaultsApplied: [],
    warnings: [],
    ...overrides,
  };
}

export function activeSessionInit(
  overrides: Partial<ActiveSessionInitResult> = {},
): ActiveSessionInitResult {
  return {
    mode: "session-init",
    layout: "full",
    resolution: "none",
    path: null,
    candidates: [],
    sessionType: "planning",
    currentWorkflow: null,
    planningStage: null,
    integrationBoundary: null,
    warnings: [],
    ...overrides,
  };
}

export function derivedFrameFromActive(
  active: ActiveSessionInitResult,
  identity: string,
  cohortDocPath: string | null,
  taskCursor: TaskListCursorFileResult | null,
  workingMemoryPath: string | null = null,
): DerivedLocusFrame {
  if (active.resolution !== "single" || active.path === null) {
    const row = {
      kind: "free-primary" as const,
      checkout: {
        folderPresent: true,
        path: "/repo",
        head: "a".repeat(40),
        branch: "main",
        detached: false,
        primary: true,
      },
      subject: null,
      markerGeneration: null,
      parentCheckoutPath: null,
      origin: null,
      identity: null,
      context: null,
      lifecycleLocation: null,
      diagnostics: [],
    };
    return {
      roster: [row],
      entering: { kind: "selected", row },
      primaryAvailability: { kind: "free", checkoutPath: "/repo" },
      identityDiscovery: { kind: "absent" },
      active: null,
    };
  }
  const key = /meta-(.+)\.md$/u.exec(active.path)?.[1] ?? "x";
  const subject = { kind: "work-unit" as const, key };
  const executionClosed = active.sessionType === "execution" && taskCursor?.status === "no-open-task";
  const context = {
    kind: "resolved" as const,
    metaPath: active.path,
    owner: null,
    branch: null,
    sessionType: active.sessionType,
    workflow: active.sessionType === "execution"
      ? executionClosed ? "verify-work-unit" : "process-task-loop"
      : active.sessionType === "integration"
        ? "integrate-work-unit"
        : active.sessionType === "planning"
          ? "planning"
          : null,
    stage: active.planningStage,
    taskListPath: active.taskListPath ?? null,
    taskCursor,
    ...(executionClosed ? { workUnitStage: "verification-closeout" as const } : {}),
    cohortDocPath,
    loadSet: resolveLoadSetManifest({
      identity,
      workingMemoryPath,
      activeWorkUnit: key,
      metaPath: active.path,
      sessionType: active.sessionType,
      workUnitStage: executionClosed ? "verification-closeout" : null,
      planningStage: active.planningStage,
      taskListPath: active.taskListPath ?? null,
      cohortDocPath,
    }),
    integrationBoundary: active.integrationBoundary,
  };
  const row = {
    kind: "work-unit" as const,
    checkout: {
      folderPresent: true,
      path: "/repo",
      head: "a".repeat(40),
      branch: `feat/${key}`,
      detached: false,
      primary: true,
    },
    subject,
    markerGeneration: "b".repeat(64),
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context,
    lifecycleLocation: "active" as const,
    diagnostics: [],
  };
  return {
    roster: [row],
    entering: { kind: "selected", row },
    primaryAvailability: { kind: "occupied", checkoutPath: "/repo", subject },
    identityDiscovery: { kind: "absent" },
    active: { checkoutPath: "/repo", subject, context },
  };
}

export function domainRulesSessionInit(
  overrides: Partial<DomainRulesSessionInitResult> = {},
): DomainRulesSessionInitResult {
  return { mode: "session-init", rules: [], warnings: [], ...overrides };
}

export const cleanCurrentWuReconcile = async (
  { slug }: Parameters<SessionInitProbes["currentWuReconcile"]>[0],
): Promise<Exclude<Awaited<ReturnType<SessionInitProbes["currentWuReconcile"]>>, { status: "unavailable" }>> => ({
  status: "clean",
  slug,
  dependency: {
    before: [],
    after: [],
    replacements: [],
    drops: [],
    discharged: [],
    live: [],
    conflicts: [],
  },
  trackedReferences: { edits: [] },
  advisories: [],
  recommendedAction: "skip",
  recommendedCommand: null,
  recommendedPromptText: "",
});

export const cleanUserReferenceReconcile: NonNullable<SessionInitProbes["userReferenceReconcile"]> = async () => ({
  status: "clean",
  authority: { status: "ready", ref: "main", transitions: [], remoteEvidence: "not-applicable" },
  plan: { status: "clean", edits: [], advisories: [] },
  recommendedAction: "skip",
  recommendedCommand: null,
  recommendedPromptText: "",
});

export type SessionInitProbeOverrides = Partial<SessionInitProbes> & {
  active?: (
    identity: string,
    role: "maintainer" | "contributor",
  ) => Promise<ActiveSessionInitResult>;
  cohortDoc?: (activeMetaPath: string) => Promise<string | null>;
  taskCursor?: (taskListPath: string) => Promise<TaskListCursorResult>;
};

export function sessionInitProbes(overrides: SessionInitProbeOverrides = {}): SessionInitProbes {
  const active = overrides.active ?? vi.fn(async () => activeSessionInit());
  const cohortDoc = overrides.cohortDoc ?? vi.fn(async (): Promise<string | null> => null);
  const taskCursor = overrides.taskCursor
    ?? vi.fn(async (): Promise<TaskListCursorResult> => ({ status: "no-open-task" }));
  return {
    derivedLocusState: vi.fn(async (identity) => {
      const activeResult = await active(identity, "maintainer");
      const cohortDocPath = activeResult.resolution === "single" && activeResult.path !== null
        ? await cohortDoc(activeResult.path)
        : null;
      let cursor: TaskListCursorFileResult | null = null;
      if (activeResult.taskListPath !== undefined && activeResult.taskListPath !== null) {
        try {
          assertLoadSetPath(activeResult.taskListPath);
          cursor = await taskCursor(activeResult.taskListPath);
        } catch {
          cursor = null;
        }
      }
      return derivedFrameFromActive(activeResult, identity, cohortDocPath, cursor);
    }),
    // The default slot fixtures below model healthy remote-derived readings carrying
    // `exact` evidence, so the default context has to be one where that evidence was
    // available. A `remote-sync-disabled` default contradicted every one of them.
    // Cases that need an absent or failed remote override this per test.
    remoteContext: vi.fn(async () => ({
      kind: "available" as const,
      snapshot: {
        kind: "available" as const,
        scope: "all-heads" as const,
        tips: { main: "a".repeat(40) },
      },
      objectAvailability: { kind: "complete" as const, commits: { ["a".repeat(40)]: true } },
      history: { kind: "complete" as const },
    })),
    user: vi.fn(async () => userSessionInit()),
    worktree: vi.fn(async () => worktreeSync()),
    worktreeIdentity: vi.fn(async () => worktreeIdentity()),
    currentHusk: vi.fn(async () => null),
    baseDistance: vi.fn(async () => baseDistance()),
    baseBranchSync: vi.fn(async () => baseBranchSync()),
    supersession: vi.fn(async () => supersessionResult()),
    dirty: vi.fn(async () => dirtyState()),
    config: vi.fn(async () => configSessionInit()),
    domainRules: vi.fn(async () => domainRulesSessionInit()),
    releaseRouting: vi.fn(async () => releaseRouting()),
    hooksPath: vi.fn(async (): Promise<HooksPathSessionAdvisory> => ({ recommendedAction: "none" })),
    currentWuReconcile: vi.fn(cleanCurrentWuReconcile),
    deliveryPosition: vi.fn(async () => null),
    userReferenceReconcile: vi.fn(cleanUserReferenceReconcile),
    roster: vi.fn(async () => rosterResult()),
    cleanupRoster: vi.fn(async () => rosterResult()),
    recovery: vi.fn(async (): Promise<CascadeResolution> => ({
      kind: "main-fallback",
      remoteEvidence: "exact",
      baseBranch: "main",
    })),
    sweep: vi.fn(async (): Promise<StaleWorktreeSweepResult> => ({
      remoteEvidence: "not-applicable",
      missingFolders: [],
      worktrees: [],
      renameMoves: [],
      retirements: [],
      warnings: [],
    })),
    orphanBranchSweep: vi.fn(async (): Promise<OrphanBranchSweepResult> => ({
      remoteEvidence: "not-applicable",
      orphans: [],
    })),
    retiredSubdirs: vi.fn(async (): Promise<RetiredSubdirDetectionResult> => ({ candidates: [] })),
    errandSweep: vi.fn(async (): Promise<ErrandStalenessSweepResult> => ({ stale: [] })),
    errandState: vi.fn(async (): Promise<ErrandStateResult> => errandStateResult()),
    materializableWorkUnits: vi.fn(
      async (): Promise<MaterializableWorkUnitDiscoveryResult> => materializableResult([]),
    ),
    workUnitState: vi.fn(async (): Promise<WorkUnitStateResult> => workUnitStateResult()),
    inboxState: vi.fn(async (): Promise<InboxStateResult> => ({
      routableCount: 0,
      executeBoundCount: 0,
      housekeepNeeded: false,
    })),
    partialPushMarker: vi.fn(
      async (): Promise<PartialPushMarkerSurfaceResult> => ({ markers: [] }),
    ),
    cohortDoc,
    taskCursor,
    ...overrides,
  };
}

export function dirtyState(overrides: Partial<DirtyStateResult> = {}): DirtyStateResult {
  return { state: "clean", fileCount: 0, ...overrides };
}

export function releaseRouting(overrides: Partial<ReleaseRoutingValue> = {}): ReleaseRoutingValue {
  return {
    taskCommit: "raw",
    workflowCommit: "raw",
    workflowPush: "raw",
    rationale: {
      releaseOptedIn: false,
      commitInterlock: "manual",
      pushInterlock: "manual",
    },
    ...overrides,
  };
}

export async function sessionInitFixture(overrides: SessionInitProbeOverrides = {}, options: Partial<Omit<RunSessionInitStatusOptions, "probes">> = {}): Promise<SessionInitProbeResult> {
 const result = await runSessionInitStatus({ identity: "andrew", role: "maintainer", ...options, probes: sessionInitProbes(overrides) });
 assertSessionInitProbeResult(result);
 return result;
}
