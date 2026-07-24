import { describe, expect, it } from "vitest";

import type { ActiveSessionInitResult } from "../../../src/commands/active/types.js";
import type { Probe } from "../../../src/commands/status/types.js";
import {
  COMPACTION_SEED_SCHEMA_VERSION,
  type CompactionSeed,
} from "../../../src/lib/compaction-seed/schema.js";
import type { DirtyStateResult } from "../../../src/lib/git/dirty-state.js";
import type { LocusStateV1 } from "../../../src/lib/locus/schema/index.js";
import {
  LOAD_SET_MANIFEST_VERSION,
  type LoadSetManifest,
} from "../../../src/lib/load-set/types.js";
import {
  RecoveryAuditVerdictSchema,
  auditRecoveryState,
  type AuditRecoveryStateOptions,
  type RecoveryAuditProbeState,
} from "../../../src/lib/recover/audit.js";
import type { RecoveryLocusFrame } from "../../../src/lib/recover/locus-context.js";
import type { CommittedProgressResolver } from "../../../src/lib/recover/committed-progress.js";
import type {
  TaskListCursor,
  TaskListCursorResult,
} from "../../../src/lib/task-list/cursor.js";
import type { TaskListCursorFileResult } from "../../../src/lib/task-list/file-cursor.js";

const LOAD_SET = {
  manifestVersion: LOAD_SET_MANIFEST_VERSION,
  entries: [
    {
      path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md",
      readMode: { kind: "full" },
    },
    {
      path: ".arc/active/tasks-compaction-recovery.md",
      readMode: { kind: "partial-strategic" },
    },
  ],
} satisfies LoadSetManifest;

const PLANNING_LOAD_SET = {
  manifestVersion: LOAD_SET_MANIFEST_VERSION,
  entries: [
    {
      path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md",
      readMode: { kind: "full" },
    },
    {
      path: ".arc/system/workflows/arc/draft-design.md",
      readMode: { kind: "full" },
    },
  ],
} satisfies LoadSetManifest;

const CURSOR = {
  section: {
    id: "4.R.3",
    title: "Expose the cursor in status envelopes and seed emission",
    lineHint: 201,
  },
  leaf: {
    id: "4.R.3",
    title: "Expose the cursor in status envelopes and seed emission",
    lineHint: 201,
  },
} satisfies TaskListCursor;

const RECORD_ID = `sha256:${"a".repeat(64)}`;
const LEASE_ID = "b".repeat(32);
const LOCUS_HINT = {
  sessionHomePath: "/repo",
  activeLocusPath: "/repo",
  recordId: RECORD_ID,
  leaseId: LEASE_ID,
  parentRecordId: null,
} as const;

function seed(overrides: Partial<CompactionSeed> = {}): CompactionSeed {
  return {
    schemaVersion: COMPACTION_SEED_SCHEMA_VERSION,
    emittedAt: "2026-06-28T12:00:00.000Z",
    repoRoot: "/repo",
    branch: "feat/compaction-recovery",
    head: "72d145021bf4166fa70efc5b9fd11916cf0a359a",
    dirty: false,
    activeWorkUnit: "compaction-recovery",
    metaPath: ".arc/active/meta-compaction-recovery.md",
    sessionType: "execution",
    currentWorkflow: null,
    taskCursor: CURSOR,
    loadSet: LOAD_SET,
    uncommittedFiles: [],
    ...overrides,
  };
}

function active(
  overrides: Partial<ActiveSessionInitResult> = {},
): ActiveSessionInitResult {
  return {
    mode: "session-init",
    layout: "full",
    resolution: "single",
    path: ".arc/active/meta-compaction-recovery.md",
    candidates: [],
    taskListPath: ".arc/active/tasks-compaction-recovery.md",
    sessionType: "execution",
    currentWorkflow: null,
    planningStage: null,
    warnings: [],
    ...overrides,
  };
}

function dirty(overrides: Partial<DirtyStateResult> = {}): DirtyStateResult {
  return {
    state: "clean",
    fileCount: 0,
    ...overrides,
  };
}

function cursorResult(
  overrides: Partial<TaskListCursor> = {},
): TaskListCursorResult {
  return {
    status: "found",
    cursor: {
      ...CURSOR,
      ...overrides,
    },
  };
}

function ok<T>(value: T): Probe<T> {
  return { ok: true, value };
}

function freshLocusState(): LocusStateV1 {
  return {
    roster: {
      mode: "locus",
      ok: true,
      primaryPath: "/repo",
      rows: [{
        kind: "managed-role",
        checkoutPath: "/repo",
        primary: true,
        recordId: RECORD_ID,
        role: {
          kind: "work-unit",
          subject: { kind: "work-unit", key: "compaction-recovery", claimId: null },
          parentCheckoutPath: null,
          originEntry: null,
        },
        identity: null,
        lease: {
          leaseId: LEASE_ID,
          state: "live",
          sessionHomePath: "/repo",
          attachedAt: "2026-06-28T12:00:00.000Z",
          heartbeatAt: "2026-06-28T12:00:00.000Z",
        },
        frame: "active",
        derived: {
          workflow: "process-task-loop",
          stage: null,
          sessionType: "execution",
          taskCursor: cursorResult(),
          loadSet: LOAD_SET,
        },
        diagnostics: [],
      }],
      diagnostics: [],
    },
    current: { kind: "resolved", sessionHomeRecordId: RECORD_ID, activeRecordId: RECORD_ID, parentRecordId: null },
    primaryAvailability: { kind: "occupied", checkoutPath: "/repo", recordId: RECORD_ID, leaseState: "live" },
    inFlightIdentities: [],
    recovery: { kind: "resume", activeRecordId: RECORD_ID, parentRecordId: null },
    reconciliation: { kind: "clean" },
  };
}

function recoveryFrame(overrides: Partial<Extract<RecoveryLocusFrame, { kind: "resolved" }>> = {}): RecoveryLocusFrame {
  return {
    kind: "resolved",
    workflow: "process-task-loop",
    sessionType: "execution",
    activeRecordId: RECORD_ID,
    parentRecordId: null,
    ...overrides,
  };
}

// The audit resolves committed-progress evidence via git; unit tests inject a
// deterministic resolver. Default is "no evidence" (null), which leaves every
// existing drift a genuine stop exactly as before the explained-drift gate.
const noCommittedProgress: CommittedProgressResolver = () => Promise.resolve(null);

function committedProgress(files: string[], advanced = true): CommittedProgressResolver {
  return () => Promise.resolve({ advanced, files: new Set(files) });
}

type LegacyAuditProbeState = Omit<RecoveryAuditProbeState, "locusState" | "recoveryFrame">
  & Partial<Pick<RecoveryAuditProbeState, "locusState" | "recoveryFrame">>;
type TestAuditOptions =
  Omit<AuditRecoveryStateOptions, "freshBranch" | "freshHead" | "freshRepoRoot" | "recover">
  & { recover: LegacyAuditProbeState }
  & Partial<Pick<AuditRecoveryStateOptions, "freshBranch" | "freshHead" | "freshRepoRoot">>;

function runAudit(options: TestAuditOptions): Promise<Awaited<ReturnType<typeof auditRecoveryState>>> {
  return auditRecoveryState({
    freshBranch: options.seed.branch,
    freshHead: options.seed.head,
    freshRepoRoot: options.seed.repoRoot,
    resolveCommittedProgress: noCommittedProgress,
    ...options,
    recover: {
      locusState: ok(freshLocusState()),
      recoveryFrame: ok(recoveryFrame()),
      ...options.recover,
    },
  });
}

describe("auditRecoveryState", () => {
  it("stops when the seed was emitted for a different repository root", async () => {
    // Everything a sibling linked worktree can legitimately share stays equal:
    // same branch, head, dirty set, and load set. Only the root differs.
    const result = await runAudit({
      seed: seed(),
      freshRepoRoot: "/repo.sibling-worktree",
      recover: {
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({
      kind: "repo-root-mismatch",
      detail: { expected: "/repo", actual: "/repo.sibling-worktree" },
    }));
  });

  it("returns ready when load-set, dirty paths, and execution cursor match the seed", async () => {
    const result = await runAudit({
      seed: seed(),
      recover: {
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: [],
    });

    expect(result).toMatchObject({
      status: "ready",
      ready: true,
      stopReasons: [],
      explainedDrift: [],
      dirtyFiles: {
        expected: [],
        actual: [],
        pathSetMatch: true,
        dirtyStateConsistent: true,
        match: true,
        explainedByCommittedProgress: false,
      },
      taskCursor: {
        expected: CURSOR,
        match: true,
      },
      locusHint: {
        expected: null,
        actual: LOCUS_HINT,
        match: true,
      },
    });
    expect(RecoveryAuditVerdictSchema.parse(result)).toEqual(result);
  });

  it("accepts an exact optional locus hint", async () => {
    const result = await runAudit({
      seed: seed({ locus: LOCUS_HINT }),
      recover: {
        active: ok(active()), dirty: ok(dirty()), loadSet: ok(LOAD_SET), taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("ready");
    expect(result.locusHint).toEqual({ expected: LOCUS_HINT, actual: LOCUS_HINT, match: true });
  });

  it.each([
    ["sessionHomePath", "/other"],
    ["activeLocusPath", "/other"],
    ["recordId", `sha256:${"c".repeat(64)}`],
    ["leaseId", "d".repeat(32)],
    ["parentRecordId", `sha256:${"e".repeat(64)}`],
  ] as const)("stops when the seed locus %s differs", async (field, replacement) => {
    const result = await runAudit({
      seed: seed({ locus: { ...LOCUS_HINT, [field]: replacement } }),
      recover: {
        active: ok(active()), dirty: ok(dirty()), loadSet: ok(LOAD_SET), taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({
      kind: "locus-hint-mismatch",
      detail: expect.objectContaining({ mismatchedFields: [field] }),
    }));
    expect(result.locusHint?.match).toBe(false);
  });

  it("stops when fresh locus authority cannot resolve", async () => {
    const result = await runAudit({
      seed: seed(),
      recover: {
        locusState: { ok: false, error: { kind: "runtime", message: "locus unavailable" } },
        recoveryFrame: { ok: false, error: { kind: "runtime", message: "locus unavailable" } },
        active: ok(active()), dirty: ok(dirty()), loadSet: ok(LOAD_SET), taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({ kind: "locus-unresolved" }));
    expect(result.locusHint).toEqual({ expected: null, actual: null, match: false });
  });

  it("accepts record-free cold completion when both fresh projections resolve none", async () => {
    const noneState = freshLocusState();
    noneState.roster.rows = [];
    noneState.current = { kind: "none" };
    noneState.primaryAvailability = { kind: "free", checkoutPath: "/repo" };
    noneState.recovery = { kind: "none" };
    const result = await runAudit({
      seed: seed({ sessionType: null, activeWorkUnit: null, metaPath: null, taskCursor: null }),
      recover: {
        locusState: ok(noneState),
        recoveryFrame: ok({ kind: "none", workflow: null, sessionType: null }),
        active: ok(active({ resolution: "none", path: null, sessionType: null, taskListPath: null })),
        dirty: ok(dirty()), loadSet: ok(LOAD_SET),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("ready");
    expect(result.locusHint).toEqual({ expected: null, actual: null, match: true });
  });

  it("accepts a resolved leaseless WU recovery frame without a lease hint", async () => {
    const idleState = freshLocusState();
    const row = idleState.roster.rows[0];
    if (row === undefined) throw new Error("missing WU fixture row");
    row.lease = null;
    row.frame = "idle";
    idleState.current = { kind: "none" };
    idleState.primaryAvailability = {
      kind: "occupied",
      checkoutPath: "/repo",
      recordId: RECORD_ID,
      leaseState: "absent",
    };
    idleState.recovery = { kind: "none" };
    const result = await runAudit({
      seed: seed(),
      recover: {
        locusState: ok(idleState),
        recoveryFrame: ok(recoveryFrame()),
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("ready");
    expect(result.locusHint).toEqual({ expected: null, actual: null, match: true });
  });

  it("accepts one close-only legacy Errand workflow beyond the pre-model seed load set", async () => {
    const noneState = freshLocusState();
    noneState.roster.rows = [];
    noneState.current = { kind: "none" };
    noneState.primaryAvailability = { kind: "free", checkoutPath: "/repo" };
    noneState.recovery = { kind: "none" };
    const legacyLoadSet = {
      ...LOAD_SET,
      entries: [
        ...LOAD_SET.entries,
        { path: ".arc/system/workflows/arc/supplemental/run-errand.md", readMode: { kind: "full" as const } },
      ],
    };
    const result = await runAudit({
      seed: seed(),
      recover: {
        locusState: ok(noneState),
        recoveryFrame: ok({
          kind: "legacy-errand",
          workflow: "run-errand",
          sessionType: "execution",
          slug: "legacy",
          branch: "chore/legacy",
          returnBranch: "feat/parent",
        }),
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(legacyLoadSet),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("ready");
    expect(result.loadSetAudit?.status).toBe("match");
    expect(result.locusHint).toEqual({ expected: null, actual: null, match: true });
  });

  it("stops when the live checkout branch differs even if HEAD is unchanged", async () => {
    const result = await runAudit({
      seed: seed(),
      recover: {
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshBranch: "main",
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual({
      kind: "branch-mismatch",
      message: "live checkout branch differs from the compaction seed baseline",
      detail: { expected: "feat/compaction-recovery", actual: "main" },
    });
    expect(RecoveryAuditVerdictSchema.parse(result)).toEqual(result);
  });

  it("explains a same-branch HEAD advance when the seed is its ancestor", async () => {
    const liveHead = "8".repeat(40);
    const result = await runAudit({
      seed: seed(),
      recover: {
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshHead: liveHead,
      freshUncommittedFiles: [],
      resolveCommittedProgress: committedProgress(["src/progress.ts"]),
    });

    expect(result.status).toBe("ready");
    expect(result.explainedDrift).toContainEqual({
      kind: "head-advanced",
      message: "live HEAD advanced from the compaction seed on the same lineage",
      detail: { expected: seed().head, actual: liveHead },
    });
    expect(RecoveryAuditVerdictSchema.parse(result)).toEqual(result);
  });

  it("rejects inconsistent verdicts, unknown stop kinds, and malformed nested audits", async () => {
    const result = await runAudit({
      seed: seed(),
      recover: {
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: [],
    });
    expect(RecoveryAuditVerdictSchema.safeParse({ ...result, ready: false }).success).toBe(false);
    expect(RecoveryAuditVerdictSchema.safeParse({
      ...result,
      status: "stop",
      ready: false,
      stopReasons: [{ kind: "unknown", message: "bad" }],
    }).success).toBe(false);
    expect(RecoveryAuditVerdictSchema.safeParse({
      ...result,
      loadSetAudit: result.loadSetAudit === null
        ? null
        : { ...result.loadSetAudit, diverged: true },
    }).success).toBe(false);
  });

  it("stops when live HEAD moved outside the seed lineage", async () => {
    const liveHead = "9".repeat(40);
    const result = await runAudit({
      seed: seed(),
      recover: {
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshHead: liveHead,
      freshUncommittedFiles: [],
      resolveCommittedProgress: committedProgress([], false),
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual({
      kind: "head-lineage-mismatch",
      message: "live HEAD is not the seed head or a descendant of it",
      detail: { expected: seed().head, actual: liveHead },
    });
  });

  it("stops on load-set drift and dirty path drift", async () => {
    const result = await runAudit({
      seed: seed({
        uncommittedFiles: ["src/original.ts"],
      }),
      recover: {
        active: ok(active()),
        dirty: ok(dirty({ state: "dirty", fileCount: 1 })),
        loadSet: ok({
          manifestVersion: LOAD_SET_MANIFEST_VERSION,
          entries: [
            LOAD_SET.entries[0]!,
            {
              path: ".arc/active/tasks-renamed.md",
              readMode: { kind: "partial-strategic" },
            },
          ],
        }),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: ["src/changed.ts"],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons.map((reason) => reason.kind)).toEqual([
      "load-set-drift",
      "dirty-path-drift",
    ]);
    expect(result.loadSetAudit?.status).toBe("diverged");
    expect(result.dirtyFiles).toEqual({
      expected: ["src/original.ts"],
      actual: ["src/changed.ts"],
      pathSetMatch: false,
      dirtyStateConsistent: true,
      match: false,
      explainedByCommittedProgress: false,
    });
  });

  it("treats dirty-path drift as ready when the absent files were committed since the seed", async () => {
    const result = await runAudit({
      seed: seed({ uncommittedFiles: ["src/a.ts", "src/b.ts"] }),
      recover: {
        active: ok(active()),
        dirty: ok(dirty({ state: "dirty", fileCount: 1 })),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      // src/b.ts left the dirty set by being committed; only src/a.ts remains.
      freshUncommittedFiles: ["src/a.ts"],
      resolveCommittedProgress: committedProgress(["src/b.ts"]),
    });

    expect(result.status).toBe("ready");
    expect(result.ready).toBe(true);
    expect(result.stopReasons).toEqual([]);
    expect(result.explainedDrift).toEqual([
      {
        kind: "dirty-path-drift",
        message:
          "seed-expected dirty files are absent because they were committed since the seed; drift is expected progression",
        detail: {
          resolvedPaths: ["src/b.ts"],
          committedSince: seed().head,
        },
      },
    ]);
    expect(result.dirtyFiles.pathSetMatch).toBe(false);
    expect(result.dirtyFiles.match).toBe(false);
    expect(result.dirtyFiles.explainedByCommittedProgress).toBe(true);
  });

  it("stops dirty-path drift when unexpected new dirt appeared alongside committed progress", async () => {
    const result = await runAudit({
      seed: seed({ uncommittedFiles: ["src/a.ts", "src/b.ts"] }),
      recover: {
        active: ok(active()),
        dirty: ok(dirty({ state: "dirty", fileCount: 2 })),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      // src/b.ts committed, but src/c.ts is new, unexplained dirt.
      freshUncommittedFiles: ["src/a.ts", "src/c.ts"],
      resolveCommittedProgress: committedProgress(["src/b.ts"]),
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons.map((reason) => reason.kind)).toContain("dirty-path-drift");
    expect(result.explainedDrift).toEqual([]);
    expect(result.dirtyFiles.explainedByCommittedProgress).toBe(false);
  });

  it("stops dirty-path drift when an absent file was not committed since the seed", async () => {
    const result = await runAudit({
      seed: seed({ uncommittedFiles: ["src/a.ts", "src/b.ts"] }),
      recover: {
        active: ok(active()),
        dirty: ok(dirty({ state: "dirty", fileCount: 1 })),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: ["src/a.ts"],
      // HEAD advanced, but src/b.ts is not among the committed files.
      resolveCommittedProgress: committedProgress([]),
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons.map((reason) => reason.kind)).toContain("dirty-path-drift");
    expect(result.explainedDrift).toEqual([]);
  });

  it("stops dirty-path drift when HEAD did not advance past the seed head", async () => {
    const result = await runAudit({
      seed: seed({ uncommittedFiles: ["src/a.ts", "src/b.ts"] }),
      recover: {
        active: ok(active()),
        dirty: ok(dirty({ state: "dirty", fileCount: 1 })),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: ["src/a.ts"],
      resolveCommittedProgress: committedProgress(["src/b.ts"], false),
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons.map((reason) => reason.kind)).toContain("dirty-path-drift");
    expect(result.explainedDrift).toEqual([]);
  });

  it("stops dirty-path drift when committed progress cannot be resolved", async () => {
    const result = await runAudit({
      seed: seed({ uncommittedFiles: ["src/a.ts", "src/b.ts"] }),
      recover: {
        active: ok(active()),
        dirty: ok(dirty({ state: "dirty", fileCount: 1 })),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: ["src/a.ts"],
      // Unresolved git evidence must never widen the gate — stays a stop.
      resolveCommittedProgress: noCommittedProgress,
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons.map((reason) => reason.kind)).toContain("dirty-path-drift");
    expect(result.explainedDrift).toEqual([]);
  });

  it("does not explain away a dirty-state contradiction even when files were committed", async () => {
    const result = await runAudit({
      seed: seed({ dirty: true, uncommittedFiles: ["src/a.ts", "src/b.ts"] }),
      recover: {
        active: ok(active()),
        // Probe claims clean, but src/a.ts is present — a contradiction, never explained.
        dirty: ok(dirty({ state: "clean", fileCount: 0 })),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: ["src/a.ts"],
      resolveCommittedProgress: committedProgress(["src/b.ts"]),
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toMatchObject([
      {
        kind: "dirty-path-drift",
        message: "fresh dirty-file path set contradicts the clean dirty-state probe",
      },
    ]);
    expect(result.explainedDrift).toEqual([]);
    expect(result.dirtyFiles.explainedByCommittedProgress).toBe(false);
  });

  it("stops when the dirty probe claims clean but porcelain paths are present", async () => {
    const result = await runAudit({
      seed: seed({
        dirty: true,
        uncommittedFiles: ["src/changed.ts"],
      }),
      recover: {
        active: ok(active()),
        dirty: ok(dirty({ state: "clean", fileCount: 0 })),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: ["src/changed.ts"],
    });

    expect(result.status).toBe("stop");
    expect(result.dirtyFiles).toEqual({
      expected: ["src/changed.ts"],
      actual: ["src/changed.ts"],
      pathSetMatch: true,
      dirtyStateConsistent: false,
      match: false,
      explainedByCommittedProgress: false,
    });
    expect(result.stopReasons).toMatchObject([
      {
        kind: "dirty-path-drift",
        message: "fresh dirty-file path set contradicts the clean dirty-state probe",
      },
    ]);
  });

  it("stops when the dirty probe claims dirty but porcelain paths are absent", async () => {
    const result = await runAudit({
      seed: seed(),
      recover: {
        active: ok(active()),
        dirty: ok(dirty({ state: "dirty", fileCount: 1 })),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.dirtyFiles).toEqual({
      expected: [],
      actual: [],
      pathSetMatch: true,
      dirtyStateConsistent: false,
      match: false,
      explainedByCommittedProgress: false,
    });
    expect(result.stopReasons).toMatchObject([
      {
        kind: "dirty-path-drift",
        message: "fresh dirty-file path set contradicts the dirty-state probe reporting dirty",
      },
    ]);
  });

  it("stops on unresolved dirty probes without reporting path drift", async () => {
    const result = await runAudit({
      seed: seed(),
      recover: {
        active: ok(active()),
        dirty: {
          ok: false,
          error: { kind: "runtime", message: "git status failed" },
        },
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.dirtyFiles).toEqual({
      expected: [],
      actual: [],
      pathSetMatch: true,
      dirtyStateConsistent: null,
      match: false,
      explainedByCommittedProgress: false,
    });
    expect(result.stopReasons.map((reason) => reason.kind)).toEqual(["dirty-unresolved"]);
  });

  it("stops when an execution seed lacks a task-list cursor", async () => {
    const result = await runAudit({
      seed: seed({ taskCursor: null }),
      recover: {
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult()),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons.map((reason) => reason.kind)).toEqual([
      "task-cursor-missing",
    ]);
    expect(result.taskCursor?.match).toBe(false);
  });

  it("stops when the fresh task-list cursor diverges from the seed", async () => {
    const result = await runAudit({
      seed: seed(),
      recover: {
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult({
          leaf: {
            id: "4.R.4",
            title: "Add deterministic arc recover audit --json",
            lineHint: 210,
          },
        })),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toMatchObject([
      {
        kind: "task-cursor-mismatch",
      },
    ]);
    expect(result.taskCursor?.actual).toMatchObject({
      status: "found",
      cursor: {
        leaf: {
          id: "4.R.4",
        },
      },
    });
  });

  it("stops on malformed fresh task-list cursor state", async () => {
    const result = await runAudit({
      seed: seed(),
      recover: {
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok({
          status: "malformed",
          error: {
            line: 12,
            message: "task marker must include an id and title",
          },
        }),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toMatchObject([
      {
        kind: "task-cursor-malformed",
      },
    ]);
  });

  it("stops when the fresh task-list cursor path is missing", async () => {
    const result = await runAudit({
      seed: seed(),
      recover: {
        active: ok(active()),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok({
          status: "missing",
          path: ".arc/active/tasks-missing.md",
        }),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toMatchObject([
      {
        kind: "task-cursor-unresolved",
        message: "fresh recovery probe could not read task list: .arc/active/tasks-missing.md",
      },
    ]);
  });

  it("audits integration task cursors when the seed captured one", async () => {
    const result = await runAudit({
      seed: seed({
        sessionType: "integration",
        currentWorkflow: "integrate-work-unit Step 4",
      }),
      recover: {
        recoveryFrame: ok(recoveryFrame({ workflow: "integrate-work-unit", sessionType: "integration" })),
        active: ok(active({
          sessionType: "integration",
          currentWorkflow: "integrate-work-unit Step 4",
        })),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok(cursorResult({
          leaf: {
            id: "4.R.4",
            title: "Add deterministic arc recover audit --json",
            lineHint: 210,
          },
        })),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toMatchObject([
      {
        kind: "task-cursor-mismatch",
      },
    ]);
  });

  it("allows cursorless integration recovery when no task-list checkbox is open", async () => {
    const result = await runAudit({
      seed: seed({
        sessionType: "integration",
        currentWorkflow: "integrate-work-unit Step 4",
        taskCursor: null,
      }),
      recover: {
        recoveryFrame: ok(recoveryFrame({ workflow: "integrate-work-unit", sessionType: "integration" })),
        active: ok(active({
          sessionType: "integration",
          currentWorkflow: "integrate-work-unit Step 4",
        })),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: ok({
          status: "no-open-task",
        }),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("ready");
    expect(result.taskCursor).toBeNull();
  });

  it("stops cursorless integration recovery when the fresh cursor probe fails", async () => {
    const result = await runAudit({
      seed: seed({
        sessionType: "integration",
        currentWorkflow: "integrate-work-unit Step 4",
        taskCursor: null,
      }),
      recover: {
        recoveryFrame: ok(recoveryFrame({ workflow: "integrate-work-unit", sessionType: "integration" })),
        active: ok(active({
          sessionType: "integration",
          currentWorkflow: "integrate-work-unit Step 4",
        })),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
        taskCursor: {
          ok: false,
          error: {
            kind: "runtime",
            message: "cursor boom",
          },
        },
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "task-cursor-unresolved",
        message: "cursor boom",
      }),
    ]));
  });

  it("stops cursorless integration recovery when the fresh cursor probe is absent", async () => {
    const result = await runAudit({
      seed: seed({
        sessionType: "integration",
        currentWorkflow: "integrate-work-unit Step 4",
        taskCursor: null,
      }),
      recover: {
        recoveryFrame: ok(recoveryFrame({ workflow: "integrate-work-unit", sessionType: "integration" })),
        active: ok(active({
          sessionType: "integration",
          currentWorkflow: "integrate-work-unit Step 4",
          taskListPath: null,
        })),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "task-cursor-unresolved",
        message: "fresh recovery probe did not resolve a task-list cursor",
      }),
    ]));
  });

  it("stops cursorless integration recovery on malformed or missing fresh cursor state", async () => {
    for (const taskCursor of [
      ok({
        status: "malformed",
        error: {
          line: 12,
          message: "task marker must include an id and title",
        },
      } satisfies TaskListCursorFileResult),
      ok({
        status: "missing",
        path: ".arc/active/tasks-missing.md",
      } satisfies TaskListCursorFileResult),
    ]) {
      const result = await runAudit({
        seed: seed({
          sessionType: "integration",
          currentWorkflow: "integrate-work-unit Step 4",
          taskCursor: null,
        }),
        recover: {
          recoveryFrame: ok(recoveryFrame({ workflow: "integrate-work-unit", sessionType: "integration" })),
          active: ok(active({
            sessionType: "integration",
            currentWorkflow: "integrate-work-unit Step 4",
          })),
          dirty: ok(dirty()),
          loadSet: ok(LOAD_SET),
          taskCursor,
        },
        freshUncommittedFiles: [],
      });

      expect(result.status).toBe("stop");
      expect(result.taskCursor?.match).toBe(false);
    }
  });

  it("accepts planning recovery from the fresh locus-derived workflow", async () => {
    const result = await runAudit({
      seed: seed({
        sessionType: "planning",
        taskCursor: null,
        currentWorkflow: "draft-design",
        loadSet: PLANNING_LOAD_SET,
      }),
      recover: {
        recoveryFrame: ok(recoveryFrame({ workflow: "draft-design", sessionType: "planning" })),
        active: ok(active({
          taskListPath: null,
          sessionType: "planning",
          planningStage: "draft-design",
        })),
        dirty: ok(dirty()),
        loadSet: ok(PLANNING_LOAD_SET),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("ready");
    expect(result.stopReasons).toEqual([]);
    expect(result.taskCursor).toBeNull();
  });
});
