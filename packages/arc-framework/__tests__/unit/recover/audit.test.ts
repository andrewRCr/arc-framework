import { describe, expect, it } from "vitest";

import type { ActiveSessionInitResult } from "../../../src/commands/active/types.js";
import type { Probe } from "../../../src/commands/status/types.js";
import {
  COMPACTION_SEED_SCHEMA_VERSION,
  type CompactionSeed,
} from "../../../src/lib/compaction-seed/schema.js";
import type { DirtyStateResult } from "../../../src/lib/git/dirty-state.js";
import {
  LOAD_SET_MANIFEST_VERSION,
  type LoadSetManifest,
} from "../../../src/lib/load-set/types.js";
import { auditRecoveryState } from "../../../src/lib/recover/audit.js";
import type {
  TaskListCursor,
  TaskListCursorResult,
} from "../../../src/lib/task-list/cursor.js";

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

describe("auditRecoveryState", () => {
  it("returns ready when load-set, dirty paths, and execution cursor match the seed", () => {
    const result = auditRecoveryState({
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
      dirtyFiles: {
        expected: [],
        actual: [],
        pathSetMatch: true,
        dirtyStateConsistent: true,
        match: true,
      },
      taskCursor: {
        expected: CURSOR,
        match: true,
      },
    });
  });

  it("stops on load-set drift and dirty path drift", () => {
    const result = auditRecoveryState({
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
    });
  });

  it("stops when the dirty probe claims clean but porcelain paths are present", () => {
    const result = auditRecoveryState({
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
    });
    expect(result.stopReasons).toMatchObject([
      {
        kind: "dirty-path-drift",
        message: "fresh dirty-file path set contradicts the clean dirty-state probe",
      },
    ]);
  });

  it("stops when the dirty probe claims dirty but porcelain paths are absent", () => {
    const result = auditRecoveryState({
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
    });
    expect(result.stopReasons).toMatchObject([
      {
        kind: "dirty-path-drift",
        message: "fresh dirty-file path set contradicts the dirty-state probe reporting dirty",
      },
    ]);
  });

  it("stops on unresolved dirty probes without reporting path drift", () => {
    const result = auditRecoveryState({
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
    });
    expect(result.stopReasons.map((reason) => reason.kind)).toEqual(["dirty-unresolved"]);
  });

  it("stops when an execution seed lacks a task-list cursor", () => {
    const result = auditRecoveryState({
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

  it("stops when the fresh task-list cursor diverges from the seed", () => {
    const result = auditRecoveryState({
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

  it("stops on malformed fresh task-list cursor state", () => {
    const result = auditRecoveryState({
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

  it("stops when the fresh task-list cursor path is missing", () => {
    const result = auditRecoveryState({
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

  it("stops for planning recovery because Current Workflow is soft after compaction", () => {
    const result = auditRecoveryState({
      seed: seed({
        sessionType: "planning",
        taskCursor: null,
        currentWorkflow: "draft-design",
      }),
      recover: {
        active: ok(active({
          taskListPath: null,
          sessionType: "planning",
          planningStage: "draft-design",
        })),
        dirty: ok(dirty()),
        loadSet: ok(LOAD_SET),
      },
      freshUncommittedFiles: [],
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toMatchObject([
      {
        kind: "planning-workflow-uncertain",
      },
    ]);
    expect(result.taskCursor).toBeNull();
  });
});
