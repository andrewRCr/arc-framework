/** Recovery audit over checkout-local seed and derived-frame facts. */

import { describe, expect, it } from "vitest";

import type { Probe } from "../../../src/commands/status/types.js";
import type { CompactionSeed } from "../../../src/lib/compaction-seed/schema.js";
import type { LoadSetManifest } from "../../../src/lib/load-set/types.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import type { DerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import {
  RecoveryAuditVerdictSchema,
  auditRecoveryState,
  type AuditRecoveryStateOptions,
  type RecoveryAuditProbeState,
} from "../../../src/lib/recover/audit.js";
import type { RecoveryLocusFrame } from "../../../src/lib/recover/locus-context.js";

const LOAD_SET = {
  manifestVersion: 1,
  entries: [
    { path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md", readMode: { kind: "full" } },
    { path: ".arc/active/tasks-demo.md", readMode: { kind: "partial-strategic" } },
    { path: ".arc/system/workflows/arc/process-task-loop.md", readMode: { kind: "full" } },
  ],
} satisfies LoadSetManifest;

const CURSOR = {
  status: "found" as const,
  cursor: {
    section: { id: "2.5", title: "Recover the session", lineHint: 30 },
    leaf: { id: "2.5.a", title: "Derive the frame", lineHint: 34 },
  },
};

function seed(overrides: Partial<CompactionSeed> = {}): CompactionSeed {
  return {
    schemaVersion: 1,
    emittedAt: "2026-08-05T12:00:00.000Z",
    repoRoot: "/repo",
    branch: "fix/demo",
    head: "a".repeat(40),
    dirty: true,
    activeWorkUnit: "demo",
    metaPath: ".arc/active/meta-demo.md",
    sessionType: "execution",
    currentWorkflow: "process-task-loop",
    taskCursor: CURSOR.cursor,
    loadSet: LOAD_SET,
    uncommittedFiles: ["src/demo.ts"],
    locus: { checkoutPath: "/repo", parentCheckoutPath: null },
    ...overrides,
  };
}

function workUnitRow(overrides: Partial<DerivedCheckoutRow> = {}): DerivedCheckoutRow {
  return {
    kind: "work-unit",
    checkout: { path: "/repo", head: "a".repeat(40), branch: "fix/demo", detached: false, primary: true },
    markerGeneration: null,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: {
      kind: "resolved",
      metaPath: ".arc/active/meta-demo.md",
      owner: "andrew",
      branch: "fix/demo",
      sessionType: "execution",
      workflow: "process-task-loop",
      stage: null,
      taskListPath: ".arc/active/tasks-demo.md",
      taskCursor: CURSOR,
      cohortDocPath: null,
      loadSet: LOAD_SET,
    },
    lifecycleLocation: "active",
    diagnostics: [],
    subject: { kind: "work-unit", key: "demo" },
    ...overrides,
  } as DerivedCheckoutRow;
}

function transientRow(parentCheckoutPath: string): DerivedCheckoutRow {
  return {
    kind: "transient",
    checkout: { path: "/repo", head: "a".repeat(40), branch: "chore/recover", detached: false, primary: true },
    markerGeneration: `sha256:${"d".repeat(64)}`,
    parentCheckoutPath,
    origin: null,
    identity: {
      kind: "errand",
      key: "recover",
      claimId: "c".repeat(32),
      protection: "full",
      branch: "chore/recover",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      state: "open",
      savedHead: null,
      changeRequest: null,
    },
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
    subject: { kind: "errand", key: "recover", claimId: "c".repeat(32) },
  };
}

function derivedFrame(overrides: Partial<DerivedLocusFrame> = {}): DerivedLocusFrame {
  const row = workUnitRow();
  return {
    roster: [row],
    entering: { kind: "selected", row },
    primaryAvailability: { kind: "occupied", checkoutPath: "/repo", subject: row.subject! },
    identityDiscovery: { kind: "absent" },
    active: {
      checkoutPath: "/repo",
      subject: { kind: "work-unit", key: "demo" },
      context: row.context!,
    },
    ...overrides,
  };
}

function recoveryFrame(overrides: Partial<Extract<RecoveryLocusFrame, { kind: "resolved" }>> = {}): RecoveryLocusFrame {
  return {
    kind: "resolved",
    subject: { kind: "work-unit", key: "demo" },
    checkoutPath: "/repo",
    parentCheckoutPath: null,
    workflow: "process-task-loop",
    sessionType: "execution",
    ...overrides,
  };
}

function ok<T>(value: T): Probe<T> {
  return { ok: true, value };
}

function recover(overrides: Partial<RecoveryAuditProbeState> = {}): RecoveryAuditProbeState {
  return {
    derivedLocusState: ok(derivedFrame()),
    recoveryFrame: ok(recoveryFrame()),
    active: ok({
      mode: "session-init",
      layout: "full",
      resolution: "single",
      path: ".arc/active/meta-demo.md",
      candidates: [],
      taskListPath: ".arc/active/tasks-demo.md",
      sessionType: "execution",
      currentWorkflow: "process-task-loop",
      planningStage: null,
      warnings: [],
    }),
    dirty: ok({ state: "dirty", fileCount: 1 }),
    loadSet: ok(LOAD_SET),
    taskCursor: ok(CURSOR),
    ...overrides,
  };
}

async function run(options: Partial<AuditRecoveryStateOptions> = {}) {
  return auditRecoveryState({
    seed: seed(),
    recover: recover(),
    freshUncommittedFiles: ["src/demo.ts"],
    freshBranch: "fix/demo",
    freshHead: "a".repeat(40),
    freshRepoRoot: "/repo",
    resolveCommittedProgress: async () => ({ advanced: false, files: new Set() }),
    ...options,
  });
}

describe("auditRecoveryState", () => {
  it("accepts identical checkout, load-set, dirty-path, and task-cursor facts", async () => {
    const result = await run();
    expect(result.status).toBe("ready");
    expect(result.locusHint).toEqual({
      expected: { checkoutPath: "/repo", parentCheckoutPath: null },
      actual: { checkoutPath: "/repo", parentCheckoutPath: null },
      match: true,
    });
    expect(RecoveryAuditVerdictSchema.parse(result)).toEqual(result);
  });

  it("stops when the entering checkout differs from the seed", async () => {
    const row = workUnitRow({
      checkout: { path: "/other", head: "a".repeat(40), branch: "fix/demo", detached: false, primary: true },
    });
    const frame = derivedFrame({ roster: [row], entering: { kind: "selected", row } });
    const result = await run({
      recover: recover({
        derivedLocusState: ok(frame),
        recoveryFrame: ok(recoveryFrame({ checkoutPath: "/other" })),
      }),
    });
    expect(result.stopReasons).toContainEqual(expect.objectContaining({ kind: "locus-hint-mismatch" }));
  });

  it("stops when the marker parent differs from the seed", async () => {
    const row = transientRow("/parent");
    const frame = derivedFrame({ roster: [row], entering: { kind: "selected", row } });
    const result = await run({
      recover: recover({
        derivedLocusState: ok(frame),
        recoveryFrame: ok(recoveryFrame({
          subject: { kind: "errand", key: "recover", claimId: "c".repeat(32) },
          parentCheckoutPath: "/parent",
          workflow: "run-errand",
        })),
      }),
    });
    expect(result.locusHint?.match).toBe(false);
    expect(result.stopReasons).toContainEqual(expect.objectContaining({ kind: "locus-hint-mismatch" }));
  });

  it("treats a failed entering-frame probe as unresolved", async () => {
    const result = await run({
      recover: recover({
        derivedLocusState: { ok: false, error: { kind: "runtime", message: "cannot read checkout" } },
      }),
    });
    expect(result.stopReasons).toContainEqual(expect.objectContaining({ kind: "locus-unresolved" }));
  });

  it("ignores malformed siblings when the exact entering row remains healthy", async () => {
    const healthy = workUnitRow();
    const malformed = workUnitRow({
      kind: "unresolved-checkout",
      checkout: { path: "/bad", head: "e".repeat(40), branch: null, detached: true, primary: false },
      context: null,
      diagnostics: [{ code: "marker-unreadable", message: "bad sibling" }],
      subject: null,
    });
    const frame = derivedFrame({ roster: [malformed, healthy], entering: { kind: "selected", row: healthy } });
    expect((await run({ recover: recover({ derivedLocusState: ok(frame) }) })).status).toBe("ready");
  });

  it("allows a stale marker parent to use base context when the seed and current marker agree", async () => {
    const row = transientRow("/missing-parent");
    const frame = derivedFrame({ roster: [row], entering: { kind: "selected", row } });
    const staleSeed = seed({ locus: { checkoutPath: "/repo", parentCheckoutPath: "/missing-parent" } });
    const result = await run({
      seed: staleSeed,
      recover: recover({
        derivedLocusState: ok(frame),
        recoveryFrame: ok(recoveryFrame({
          subject: { kind: "errand", key: "recover", claimId: "c".repeat(32) },
          parentCheckoutPath: "/missing-parent",
          workflow: "run-errand",
          sessionType: null,
        })),
      }),
    });
    expect(result.status).toBe("ready");
  });

  it("preserves the repository-root binding independently of the locus hint", async () => {
    const result = await run({ freshRepoRoot: "/other" });
    expect(result.stopReasons).toContainEqual(expect.objectContaining({ kind: "repo-root-mismatch" }));
  });

  it("stops on branch or non-descendant HEAD drift", async () => {
    const branch = await run({ freshBranch: "other" });
    expect(branch.stopReasons).toContainEqual(expect.objectContaining({ kind: "branch-mismatch" }));
    const head = await run({ freshHead: "b".repeat(40) });
    expect(head.stopReasons).toContainEqual(expect.objectContaining({ kind: "head-lineage-mismatch" }));
  });

  it("records descendant HEAD advancement as explained progress", async () => {
    const result = await run({
      freshHead: "b".repeat(40),
      resolveCommittedProgress: async () => ({ advanced: true, files: new Set() }),
    });
    expect(result.status).toBe("ready");
    expect(result.explainedDrift).toContainEqual(expect.objectContaining({ kind: "head-advanced" }));
  });

  it("stops on load-set drift", async () => {
    const result = await run({
      recover: recover({ loadSet: ok({ manifestVersion: 1, entries: [] }) }),
    });
    expect(result.stopReasons).toContainEqual(expect.objectContaining({ kind: "load-set-drift" }));
  });

  it("stops on new dirty paths but explains seed paths committed since emission", async () => {
    const newDirt = await run({ freshUncommittedFiles: ["src/demo.ts", "src/new.ts"] });
    expect(newDirt.stopReasons).toContainEqual(expect.objectContaining({ kind: "dirty-path-drift" }));

    const committed = await run({
      freshHead: "b".repeat(40),
      freshUncommittedFiles: [],
      recover: recover({ dirty: ok({ state: "clean", fileCount: 0 }) }),
      resolveCommittedProgress: async () => ({ advanced: true, files: new Set(["src/demo.ts"]) }),
    });
    expect(committed.status).toBe("ready");
    expect(committed.explainedDrift).toContainEqual(expect.objectContaining({ kind: "dirty-path-drift" }));
  });

  it("stops on task-cursor drift or a missing required cursor", async () => {
    const drifted = await run({
      recover: recover({
        taskCursor: ok({
          status: "found",
          cursor: { ...CURSOR.cursor, leaf: { ...CURSOR.cursor.leaf, id: "2.5.b" } },
        }),
      }),
    });
    expect(drifted.stopReasons).toContainEqual(expect.objectContaining({ kind: "task-cursor-mismatch" }));

    const missing = await run({ seed: seed({ taskCursor: null }) });
    expect(missing.stopReasons).toContainEqual(expect.objectContaining({ kind: "task-cursor-missing" }));
  });

  it("does not require a cursor for planning recovery", async () => {
    const planningFrame = recoveryFrame({ workflow: "draft-design", sessionType: "planning" });
    const result = await run({
      seed: seed({ sessionType: "planning", taskCursor: null }),
      recover: recover({ recoveryFrame: ok(planningFrame), taskCursor: undefined }),
    });
    expect(result.status).toBe("ready");
    expect(result.taskCursor).toBeNull();
  });
});
