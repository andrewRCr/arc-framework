/** Recovery audit over checkout-local seed and derived-frame facts. */

import { describe, expect, it } from "vitest";

import type { Probe } from "../../../src/commands/status/types.js";
import type { CompactionSeed } from "../../../src/lib/compaction-seed/schema.js";
import type { LoadSetManifest } from "../../../src/lib/load-set/types.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import type { DerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import { resolveTaskListCursor } from "../../../src/lib/task-list/cursor.js";
import {
  RecoveryAuditVerdictSchema,
  auditRecoveryState,
  type AuditRecoveryStateOptions,
  type RecoveryAuditProbeState,
} from "../../../src/lib/recover/audit.js";
import type { RecoveryLocusFrame } from "../../../src/lib/recover/locus-context.js";
import {
  createStandardReviewReservation,
  projectCorrectiveDeliveryStatusBoundary,
  projectCandidateReviewBoundary,
  projectPublicationBoundary,
} from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const LOAD_SET = {
  manifestVersion: 1,
  entries: [
    { path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md", readMode: { kind: "full" } },
    { path: ".arc/active/tasks-demo.md", readMode: { kind: "partial-strategic" } },
    { path: ".arc/system/workflows/arc/process-task-loop.md", readMode: { kind: "full" } },
  ],
} satisfies LoadSetManifest;

const CLOSEOUT_LOAD_SET = {
  manifestVersion: 1,
  entries: [
    LOAD_SET.entries[0]!,
    {
      path: ".arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md",
      readMode: { kind: "full" },
    },
  ],
} satisfies LoadSetManifest;

const INTEGRATION_LOAD_SET = {
  manifestVersion: 1,
  entries: [
    LOAD_SET.entries[0]!,
    {
      path: ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      readMode: { kind: "full" },
    },
  ],
} satisfies LoadSetManifest;

const INTEGRATION_TASK_LOAD_SET = {
  manifestVersion: 1,
  entries: [
    LOAD_SET.entries[0]!,
    LOAD_SET.entries[1]!,
    LOAD_SET.entries[2]!,
  ],
} satisfies LoadSetManifest;

const CLOSED_INTEGRATION_TASKS = [
  "# Task List: Demo",
  "",
  "## **Phase 1:** Correction",
  "",
  "### `[x]` **1.1 Close the public member**",
  "",
  "    - `[x]` **1.1.a Preserve the reviewed target**",
  "",
  "## **Phase 2:** Finish",
  "",
  "### `[x]` **2.1 Resume integration**",
  "",
].join("\n");

const APPENDED_INTEGRATION_TASKS = CLOSED_INTEGRATION_TASKS
  .replace("### `[x]` **1.1 Close the public member**", "### `[ ]` **1.1 Close the public member**")
  .replace(
    "    - `[x]` **1.1.a Preserve the reviewed target**",
    [
      "    - `[x]` **1.1.a Preserve the reviewed target**",
      "",
      "    - `[ ]` **1.1.b Correct the public member**",
    ].join("\n"),
  );

const ADVANCED_INTEGRATION_TASKS = APPENDED_INTEGRATION_TASKS
  .replace("    - `[ ]` **1.1.b Correct the public member**", [
    "    - `[x]` **1.1.b Correct the public member**",
    "",
    "    - `[ ]` **1.1.c Prove the correction**",
  ].join("\n"));

const CLOSED_CORRECTION_TASKS = APPENDED_INTEGRATION_TASKS
  .replace("### `[ ]` **1.1 Close the public member**", "### `[x]` **1.1 Close the public member**")
  .replace("    - `[ ]` **1.1.b Correct the public member**", "    - `[x]` **1.1.b Correct the public member**");

const DELETED_SEED_TASK = ADVANCED_INTEGRATION_TASKS
  .replace("    - `[x]` **1.1.b Correct the public member**\n\n", "");

const SUBSTITUTED_SEED_TASK = ADVANCED_INTEGRATION_TASKS
  .replace("**1.1.b Correct the public member**", "**1.1.b Replace the public member**");

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

function archivedIntegrationOptions(options: {
  slug?: string;
  archivedMetaPath?: string;
  contextMetaPath?: string;
  archivedWorkflowPath?: string;
  metaReadMode?: LoadSetManifest["entries"][number]["readMode"];
} = {}): Partial<AuditRecoveryStateOptions> {
  const slug = options.slug ?? "demo";
  const activeMetaPath = `.arc/active/meta-${slug}.md`;
  const archivedMetaPath = options.archivedMetaPath
    ?? `.arc/completed/2026-q3/49_${slug}/meta-${slug}.md`;
  const baseline = {
    manifestVersion: 1 as const,
    entries: [
      { path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md", readMode: { kind: "full" as const } },
      { path: activeMetaPath, readMode: { kind: "full" as const } },
      {
        path: ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
        readMode: { kind: "full" as const },
      },
    ],
  } satisfies LoadSetManifest;
  const archived = {
    manifestVersion: 1 as const,
    entries: [
      baseline.entries[0]!,
      { path: archivedMetaPath, readMode: options.metaReadMode ?? { kind: "full" as const } },
      {
        ...baseline.entries[2]!,
        path: options.archivedWorkflowPath ?? baseline.entries[2]!.path,
      },
    ],
  } satisfies LoadSetManifest;
  const contextMetaPath = options.contextMetaPath ?? archivedMetaPath;
  const row = workUnitRow({
    lifecycleLocation: "completed",
    subject: { kind: "work-unit", key: slug },
    context: {
      ...workUnitRow().context!,
      metaPath: contextMetaPath,
      sessionType: "integration",
      workflow: "integrate-work-unit",
      taskListPath: contextMetaPath.replace(/meta-[^/]+\.md$/u, `tasks-${slug}.md`),
      taskCursor: { status: "no-open-task" },
      loadSet: archived,
    },
  });
  const state = derivedFrame({
    roster: [row],
    entering: { kind: "selected", row },
    active: { checkoutPath: "/repo", subject: { kind: "work-unit", key: slug }, context: row.context! },
  });

  return {
    seed: seed({
      activeWorkUnit: slug,
      metaPath: activeMetaPath,
      sessionType: "integration",
      currentWorkflow: "integrate-work-unit",
      taskCursor: null,
      loadSet: baseline,
    }),
    recover: recover({
      derivedLocusState: ok(state),
      recoveryFrame: ok(recoveryFrame({
        subject: { kind: "work-unit", key: slug },
        workflow: "integrate-work-unit",
        sessionType: "integration",
      })),
      loadSet: ok(archived),
      taskCursor: ok({ status: "no-open-task" }),
    }),
    freshHead: "b".repeat(40),
    resolveCommittedProgress: async () => ({ advanced: true, files: new Set() }),
  };
}

function publicIntegrationToTaskOptions(input: {
  seedContent?: string;
  freshContent?: string;
  freshLoadSet?: LoadSetManifest;
  checkoutPath?: string;
  freshWorkUnit?: string;
} = {}): Partial<AuditRecoveryStateOptions> {
  const seedContent = input.seedContent ?? CLOSED_INTEGRATION_TASKS;
  const freshContent = input.freshContent ?? APPENDED_INTEGRATION_TASKS;
  const freshLoadSet = input.freshLoadSet ?? INTEGRATION_TASK_LOAD_SET;
  const checkoutPath = input.checkoutPath ?? "/repo";
  const freshWorkUnit = input.freshWorkUnit ?? "demo";
  const freshCursor = resolveTaskListCursor(freshContent);
  if (freshCursor.status !== "found") throw new Error("expected an appended correction cursor");
  const row = workUnitRow({
    checkout: { path: checkoutPath, head: "b".repeat(40), branch: "fix/demo", detached: false, primary: true },
    subject: { kind: "work-unit", key: freshWorkUnit },
    context: {
      ...workUnitRow().context!,
      sessionType: "integration",
      workflow: "process-task-loop",
      taskCursor: freshCursor,
      loadSet: freshLoadSet,
    },
  });
  const state = derivedFrame({
    roster: [row],
    entering: { kind: "selected", row },
    active: { checkoutPath, subject: { kind: "work-unit", key: freshWorkUnit }, context: row.context! },
  });
  return {
    seed: seed({
      dirty: false,
      sessionType: "integration",
      currentWorkflow: "integrate-work-unit",
      taskCursor: null,
      loadSet: INTEGRATION_LOAD_SET,
      uncommittedFiles: [],
    }),
    recover: recover({
      derivedLocusState: ok(state),
      recoveryFrame: ok(recoveryFrame({
        subject: { kind: "work-unit", key: freshWorkUnit },
        checkoutPath,
        workflow: "process-task-loop",
        sessionType: "integration",
      })),
      dirty: ok({ state: "clean", fileCount: 0 }),
      loadSet: ok(freshLoadSet),
      taskCursor: ok(freshCursor),
    }),
    freshUncommittedFiles: [],
    freshHead: "b".repeat(40),
    resolveCommittedProgress: async () => ({
      advanced: true,
      files: new Set([".arc/active/tasks-demo.md"]),
    }),
    resolveTaskListEvidence: async () => ({
      status: "ok" as const,
      seed: seedContent,
      fresh: freshContent,
    }),
  };
}

function integrationTaskProgressionOptions(input: {
  freshContent: string;
  workflow: "process-task-loop" | "verify-work-unit" | "integrate-work-unit";
  loadSet: LoadSetManifest;
  workUnitStage?: "delivery-correction";
}): Partial<AuditRecoveryStateOptions> {
  const seedCursor = resolveTaskListCursor(APPENDED_INTEGRATION_TASKS);
  const freshCursor = resolveTaskListCursor(input.freshContent);
  if (seedCursor.status !== "found") throw new Error("expected a seed correction cursor");
  if (freshCursor.status === "malformed") throw new Error("expected a valid fresh task list");
  const row = workUnitRow({
    checkout: { path: "/repo", head: "b".repeat(40), branch: "fix/demo", detached: false, primary: true },
    context: {
      ...workUnitRow().context!,
      sessionType: "integration",
      workflow: input.workflow,
      taskCursor: freshCursor,
      loadSet: input.loadSet,
      ...(input.workUnitStage === undefined ? {} : { workUnitStage: input.workUnitStage }),
    },
  });
  const state = derivedFrame({
    roster: [row],
    entering: { kind: "selected", row },
    active: { checkoutPath: "/repo", subject: { kind: "work-unit", key: "demo" }, context: row.context! },
  });
  return {
    seed: seed({
      dirty: false,
      sessionType: "integration",
      currentWorkflow: "process-task-loop",
      taskCursor: seedCursor.cursor,
      loadSet: INTEGRATION_TASK_LOAD_SET,
      uncommittedFiles: [],
    }),
    recover: recover({
      derivedLocusState: ok(state),
      recoveryFrame: ok(recoveryFrame({ workflow: input.workflow, sessionType: "integration" })),
      dirty: ok({ state: "clean", fileCount: 0 }),
      loadSet: ok(input.loadSet),
      taskCursor: ok(freshCursor),
    }),
    freshUncommittedFiles: [],
    freshHead: "b".repeat(40),
    resolveCommittedProgress: async () => ({
      advanced: true,
      files: new Set([".arc/active/tasks-demo.md"]),
    }),
    resolveTaskListEvidence: async () => ({
      status: "ok" as const,
      seed: APPENDED_INTEGRATION_TASKS,
      fresh: input.freshContent,
    }),
  };
}

function verificationToPublicOptions(input: {
  readonly includeContinuation?: boolean;
} = {}): Partial<AuditRecoveryStateOptions> {
  const candidateId = `sha256:${"c".repeat(64)}`;
  const candidateSubjectDigest = `sha256:${"d".repeat(64)}`;
  const planId = "471a3ea0-5232-4073-b9ef-e9c78917af55";
  const publicationBoundary = projectPublicationBoundary({
    workUnit: "demo",
    branch: "fix/demo",
    candidateId,
    candidateSubjectDigest,
    reservation: createStandardReviewReservation({
      candidateId,
      sourceId: "codex-pr",
      target: {
        kind: "delivery",
        repository: "owner/repo",
        workUnitId: "demo",
        planId,
      },
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    }),
    changeRequest: { repository: "owner/repo", pullRequest: 42 },
    terminus: null,
  });
  const integrationBoundary = input.includeContinuation === false
    ? publicationBoundary
    : projectCorrectiveDeliveryStatusBoundary({
        workUnit: "demo",
        candidateId,
        candidateSubjectDigest,
        supersedesCandidateId: null,
        sourceBoundary: publicationBoundary,
        deliveryContinuation: {
          schemaVersion: 1,
          semanticsVersion: "delivery-public-review-continuation/v1",
          planId,
          planRevision: 1,
          planDigest: `sha256:${"1".repeat(64)}`,
          stateRevision: 2,
          stateDigest: `sha256:${"2".repeat(64)}`,
          memberEvidenceDigest: `sha256:${"3".repeat(64)}`,
        },
      });
  const row = workUnitRow({
    checkout: { path: "/repo", head: "b".repeat(40), branch: "fix/demo", detached: false, primary: true },
    context: {
      ...workUnitRow().context!,
      sessionType: "integration",
      workflow: "integrate-work-unit",
      taskCursor: { status: "no-open-task" },
      loadSet: INTEGRATION_LOAD_SET,
      integrationBoundary,
    },
  });
  const state = derivedFrame({
    roster: [row],
    entering: { kind: "selected", row },
    active: { checkoutPath: "/repo", subject: { kind: "work-unit", key: "demo" }, context: row.context! },
  });
  return {
    seed: seed({
      dirty: false,
      sessionType: "integration",
      currentWorkflow: "verify-work-unit",
      taskCursor: null,
      loadSet: CLOSEOUT_LOAD_SET,
      uncommittedFiles: [],
    }),
    recover: recover({
      derivedLocusState: ok(state),
      recoveryFrame: ok(recoveryFrame({ workflow: "integrate-work-unit", sessionType: "integration" })),
      dirty: ok({ state: "clean", fileCount: 0 }),
      loadSet: ok(INTEGRATION_LOAD_SET),
      taskCursor: ok({ status: "no-open-task" }),
    }),
    freshUncommittedFiles: [],
    freshHead: "b".repeat(40),
    resolveCommittedProgress: async () => ({ advanced: true, files: new Set() }),
  };
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

  it("preserves the physical locus while refusing an unresolved selected subject", async () => {
    const unresolved = workUnitRow({
      kind: "unresolved-checkout",
      context: null,
      diagnostics: [{
        code: "topology-mismatch",
        message: "Observed checkout topology does not corroborate the authority-derived subject",
      }],
    });
    const frame = derivedFrame({
      roster: [unresolved],
      entering: { kind: "selected", row: unresolved },
      active: null,
    });
    const result = await run({
      recover: recover({
        derivedLocusState: ok(frame),
        recoveryFrame: ok(recoveryFrame()),
      }),
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({ kind: "locus-unresolved" }));
    expect(result.locusHint).toEqual({
      expected: { checkoutPath: "/repo", parentCheckoutPath: null },
      actual: { checkoutPath: "/repo", parentCheckoutPath: null },
      match: false,
    });
  });

  it("preserves the physical locus when recovery-frame projection fails", async () => {
    const result = await run({
      recover: recover({
        recoveryFrame: {
          ok: false,
          error: { kind: "runtime", message: "cannot project recovery context" },
        },
      }),
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({ kind: "locus-unresolved" }));
    expect(result.locusHint).toEqual({
      expected: { checkoutPath: "/repo", parentCheckoutPath: null },
      actual: { checkoutPath: "/repo", parentCheckoutPath: null },
      match: false,
    });
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

  it("admits a newly appended canonical correction cursor inside public integration", async () => {
    const result = await run(publicIntegrationToTaskOptions());

    expect(result.status).toBe("ready");
    expect(result.taskCursor).toMatchObject({ match: true, actual: { status: "found" } });
    expect(result.explainedDrift).toContainEqual(expect.objectContaining({
      kind: "integration-correction-progression",
      detail: expect.objectContaining({ transition: "public-to-task" }),
    }));
  });

  it("admits the next canonical correction leaf only after the seed leaf closes", async () => {
    const result = await run(integrationTaskProgressionOptions({
      freshContent: ADVANCED_INTEGRATION_TASKS,
      workflow: "process-task-loop",
      loadSet: INTEGRATION_TASK_LOAD_SET,
    }));

    expect(result.status).toBe("ready");
    expect(result.taskCursor).toMatchObject({
      match: true,
      actual: { status: "found", cursor: { leaf: { id: "1.1.c" } } },
    });
    expect(result.explainedDrift).toContainEqual(expect.objectContaining({
      kind: "integration-correction-progression",
      detail: expect.objectContaining({ transition: "task-to-task" }),
    }));
  });

  it("admits corrective verification only after the seed leaf closes the task list", async () => {
    const result = await run(integrationTaskProgressionOptions({
      freshContent: CLOSED_CORRECTION_TASKS,
      workflow: "verify-work-unit",
      loadSet: CLOSEOUT_LOAD_SET,
    }));

    expect(result.status).toBe("ready");
    expect(result.taskCursor).toEqual({
      expected: expect.objectContaining({ leaf: expect.objectContaining({ id: "1.1.b" }) }),
      actual: { status: "no-open-task" },
      match: true,
    });
    expect(result.explainedDrift).toContainEqual(expect.objectContaining({
      kind: "integration-correction-progression",
      detail: expect.objectContaining({ transition: "task-to-verification" }),
    }));
  });

  it("admits scoped correction continuation only while exact delivery verification remains pending", async () => {
    const result = await run(integrationTaskProgressionOptions({
      freshContent: CLOSED_CORRECTION_TASKS,
      workflow: "integrate-work-unit",
      loadSet: INTEGRATION_LOAD_SET,
      workUnitStage: "delivery-correction",
    }));

    expect(result.status).toBe("ready");
    expect(result.taskCursor).toEqual({
      expected: expect.objectContaining({ leaf: expect.objectContaining({ id: "1.1.b" }) }),
      actual: { status: "no-open-task" },
      match: true,
    });
    expect(result.explainedDrift).toContainEqual(expect.objectContaining({
      kind: "integration-correction-progression",
      detail: expect.objectContaining({ transition: "task-to-continuation" }),
    }));
  });

  it("returns from corrective verification only through the exact public delivery boundary", async () => {
    const result = await run(verificationToPublicOptions());

    expect(result.status).toBe("ready");
    expect(result.taskCursor).toBeNull();
    expect(result.explainedDrift).toContainEqual(expect.objectContaining({
      kind: "integration-correction-progression",
      detail: expect.objectContaining({ transition: "verification-to-public" }),
    }));
  });

  it("refuses corrective verification return without Candidate-bound delivery status", async () => {
    const result = await run(verificationToPublicOptions({ includeContinuation: false }));

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({
      kind: "integration-correction-unresolved",
      message: expect.stringContaining("Candidate-bound delivery status"),
    }));
  });

  it.each([
    ["deletion", DELETED_SEED_TASK],
    ["title substitution", SUBSTITUTED_SEED_TASK],
  ])("refuses seed-leaf %s during corrective task progression", async (_name, freshContent) => {
    const result = await run(integrationTaskProgressionOptions({
      freshContent,
      workflow: "process-task-loop",
      loadSet: INTEGRATION_TASK_LOAD_SET,
    }));

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({
      kind: "integration-correction-unresolved",
    }));
  });

  it.each([
    [
      "deletes an unrelated task",
      ADVANCED_INTEGRATION_TASKS.replace("### `[x]` **2.1 Resume integration**\n", ""),
    ],
    [
      "renames an unrelated task",
      ADVANCED_INTEGRATION_TASKS.replace("2.1 Resume integration", "2.1 Replace integration"),
    ],
    [
      "reparents an unrelated task",
      ADVANCED_INTEGRATION_TASKS.replace(
        "## **Phase 2:** Finish\n\n### `[x]` **2.1 Resume integration**",
        "    - `[x]` **2.1 Resume integration**\n\n## **Phase 2:** Finish",
      ),
    ],
    [
      "reorders a pre-existing task",
      ADVANCED_INTEGRATION_TASKS
        .replace("    - `[x]` **1.1.a Preserve the reviewed target**\n\n", "")
        .replace(
          "    - `[x]` **1.1.b Correct the public member**",
          "    - `[x]` **1.1.b Correct the public member**\n\n"
            + "    - `[x]` **1.1.a Preserve the reviewed target**",
        ),
    ],
    [
      "changes an unrelated task marker",
      ADVANCED_INTEGRATION_TASKS.replace(
        "### `[x]` **2.1 Resume integration**",
        "### `[~]` **2.1 Resume integration**",
      ),
    ],
  ])("refuses corrective progression that %s", async (_name, freshContent) => {
    const result = await run(integrationTaskProgressionOptions({
      freshContent,
      workflow: "process-task-loop",
      loadSet: INTEGRATION_TASK_LOAD_SET,
    }));

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({
      kind: "integration-correction-unresolved",
      message: expect.stringContaining("task-list structure"),
    }));
  });

  it("ignores prose changes while proving corrective task progression", async () => {
    const result = await run(integrationTaskProgressionOptions({
      freshContent: ADVANCED_INTEGRATION_TASKS.replace(
        "    - `[x]` **1.1.b Correct the public member**",
        "    - `[x]` **1.1.b Correct the public member**\n\n"
          + "        - _Outcome:_ The exact public member was corrected.",
      ),
      workflow: "process-task-loop",
      loadSet: INTEGRATION_TASK_LOAD_SET,
    }));

    expect(result.status).toBe("ready");
  });

  it("refuses a public-to-task transition that rewrites existing task structure", async () => {
    const result = await run(publicIntegrationToTaskOptions({
      freshContent: APPENDED_INTEGRATION_TASKS.replace(
        "1.1.a Preserve the reviewed target",
        "1.1.a Substitute the reviewed target",
      ),
    }));

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({
      kind: "integration-correction-unresolved",
    }));
  });

  it.each([
    ["checkout", { checkoutPath: "/other" }],
    ["work unit", { freshWorkUnit: "other" }],
  ])("refuses correction progression across a different %s", async (_name, overrides) => {
    const result = await run(publicIntegrationToTaskOptions(overrides));

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({
      kind: "integration-correction-unresolved",
    }));
  });

  it("refuses a correction transition with an additional load-set entry", async () => {
    const result = await run(publicIntegrationToTaskOptions({
      freshLoadSet: {
        manifestVersion: 1,
        entries: [
          ...INTEGRATION_TASK_LOAD_SET.entries,
          { path: ".arc/reference/unrelated.md", readMode: { kind: "full" } },
        ],
      },
    }));

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "integration-correction-unresolved" }),
      expect.objectContaining({ kind: "load-set-drift" }),
    ]));
  });

  it("refuses reverse movement from a corrective task directly to public integration", async () => {
    const result = await run(integrationTaskProgressionOptions({
      freshContent: CLOSED_CORRECTION_TASKS,
      workflow: "integrate-work-unit",
      loadSet: INTEGRATION_LOAD_SET,
    }));

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "load-set-drift" }),
      expect.objectContaining({ kind: "task-cursor-unresolved" }),
    ]));
  });

  it("refuses malformed correction cursors", async () => {
    const options = publicIntegrationToTaskOptions();
    if (options.recover === undefined) throw new Error("expected recovery probes");
    const result = await run({
      ...options,
      recover: {
        ...options.recover,
        taskCursor: ok({ status: "malformed", error: { line: 4, message: "bad task marker" } }),
      },
    });

    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({ kind: "task-cursor-malformed" }));
  });

  it("recovers an exact execution-shaped seed through the Candidate prepublication projection", async () => {
    const candidateId = `sha256:${"c".repeat(64)}`;
    const prepublicationLoadSet = {
      manifestVersion: 1 as const,
      entries: [
        LOAD_SET.entries[0]!,
        {
          path: ".arc/system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md",
          readMode: { kind: "full" as const },
        },
      ],
    } satisfies LoadSetManifest;
    const row = workUnitRow({
      context: {
        ...workUnitRow().context!,
        sessionType: "prepublication",
        workflow: "prepare-work-unit",
        taskCursor: { status: "no-open-task" },
        loadSet: prepublicationLoadSet,
        integrationBoundary: projectCandidateReviewBoundary({ workUnit: "demo", candidateId }),
      },
    });
    const state = derivedFrame({
      roster: [row],
      entering: { kind: "selected", row },
      active: { checkoutPath: "/repo", subject: { kind: "work-unit", key: "demo" }, context: row.context! },
    });

    const result = await run({
      seed: seed({
        dirty: false,
        currentWorkflow: "verify-work-unit",
        taskCursor: null,
        loadSet: CLOSEOUT_LOAD_SET,
        uncommittedFiles: [],
      }),
      recover: recover({
        derivedLocusState: ok(state),
        recoveryFrame: ok(recoveryFrame({ workflow: "prepare-work-unit", sessionType: "prepublication" })),
        dirty: ok({ state: "clean", fileCount: 0 }),
        loadSet: ok(prepublicationLoadSet),
        taskCursor: ok({ status: "no-open-task" }),
      }),
      freshUncommittedFiles: [],
      freshHead: "b".repeat(40),
      resolveCommittedProgress: async () => ({ advanced: true, files: new Set() }),
    });

    expect(result.status).toBe("ready");
    expect(result.taskCursor).toBeNull();
    expect(result.explainedDrift).toContainEqual(expect.objectContaining({
      kind: "load-set-prepublication-projection",
    }));
  });

  it("accepts exact cursorless execution verification closeout", async () => {
    const row = workUnitRow({
      context: {
        ...workUnitRow().context!,
        workflow: "verify-work-unit",
        taskCursor: { status: "no-open-task" },
        loadSet: CLOSEOUT_LOAD_SET,
      },
    });
    const state = derivedFrame({
      roster: [row],
      entering: { kind: "selected", row },
      active: { checkoutPath: "/repo", subject: { kind: "work-unit", key: "demo" }, context: row.context! },
    });

    const result = await run({
      seed: seed({
        currentWorkflow: "verify-work-unit",
        taskCursor: null,
        loadSet: CLOSEOUT_LOAD_SET,
      }),
      recover: recover({
        derivedLocusState: ok(state),
        recoveryFrame: ok(recoveryFrame({ workflow: "verify-work-unit" })),
        loadSet: ok(CLOSEOUT_LOAD_SET),
        taskCursor: ok({ status: "no-open-task" }),
      }),
    });

    expect(result.status).toBe("ready");
    expect(result.taskCursor).toBeNull();
    expect(result.stopReasons).toEqual([]);
  });

  it("accepts the exact active-to-completed meta relocation for an archived integration WU", async () => {
    const result = await run(archivedIntegrationOptions());

    expect(result.status).toBe("ready");
    expect(result.explainedDrift).toContainEqual(expect.objectContaining({
      kind: "load-set-archival-relocation",
    }));
  });

  it.each([
    {
      name: "additional path drift",
      options: {
        archivedWorkflowPath: ".arc/system/workflows/arc/work-unit-lifecycle/other.md",
      },
    },
    {
      name: "non-full metadata read mode",
      options: {
        metaReadMode: { kind: "partial-section" as const, heading: "Metadata" },
      },
    },
    {
      name: "completed metadata path mismatch",
      options: {
        contextMetaPath: ".arc/completed/2026-q3/50_demo/meta-demo.md",
      },
    },
  ])("refuses archival relocation with $name", async ({ options }) => {
    const result = await run(archivedIntegrationOptions(options));
    expect(result.status).toBe("stop");
    expect(result.stopReasons).toContainEqual(expect.objectContaining({ kind: "load-set-drift" }));
  });

  it("does not let recovery slugs act as archive-path regex syntax", async () => {
    const result = await run(archivedIntegrationOptions({
      slug: "de.mo",
      archivedMetaPath: ".arc/completed/2026-q3/49_deXmo/meta-deXmo.md",
    }));

    expect(result.status).toBe("stop");
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
