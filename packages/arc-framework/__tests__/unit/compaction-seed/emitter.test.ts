import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  emitCompactionSeed,
  parseUncommittedFiles,
  resolveCompactionSeedPath,
} from "../../../src/lib/compaction-seed/emitter.js";
import {
  parseCompactionSeedJson,
  stringifyCompactionSeed,
  type CompactionSeed,
} from "../../../src/lib/compaction-seed/schema.js";
import { buildDeliveryTaskInventory } from "../../../src/lib/delivery/task-inventory.js";
import {
  LOAD_SET_MANIFEST_VERSION,
  type LoadSetManifest,
} from "../../../src/lib/load-set/types.js";
import type { DerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import { analyzeTaskList } from "../../../src/lib/task-list/cursor.js";
import { scanTaskListStructure } from "../../../src/lib/task-list/scanner.js";
import { scanTaskListSegmentation } from "../../../src/lib/task-list/segmentation.js";

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
  status: "found" as const,
  cursor: {
    section: {
      id: "2.1",
      title: "Define the task-list cursor",
      lineHint: 66,
    },
    leaf: {
      id: "2.1.a",
      title: "Parse cursor markers",
      lineHint: 70,
    },
  },
};

const SEGMENTED_COMPATIBILITY_FIXTURE = [
  "# Task List: segmented-compatible",
  "",
  "## Delivery Plan",
  "",
  "### `[x]` **9.9 Rendered member**",
  "",
  "## **Phase 1:** Foundation",
  "",
  "_Mode:_ `layer` through Phase 2 — closes on the consumer chain.",
  "",
  "### `[x]` **1.1 Build foundation**",
  "",
  "- _Goal:_ Build the shared foundation.",
  "",
  "## **Phase 2:** Exercise",
  "",
  "_Exit criterion:_ The consumer chain preserves the segmented plan shape.",
  "",
  "### `[ ]` **2.1 Exercise the chain** — validate exit criterion at segment scope",
  "",
  "- _Goal:_ Exercise the segmented consumer chain.",
  "",
  "    - `[ ]` **2.1.a Preserve the cursor**",
  "",
  "### `[ ]` **2.2 Close the member** — validate criteria at member scope",
  "",
  "- _Goal:_ Close the delivery member.",
  "",
  "## **Phase 3:** Verification",
  "",
  "### `[ ]` **3.1 Verify the work unit**",
  "",
].join("\n");

function derivedFrame(parentCheckoutPath: string | null = null): DerivedLocusFrame {
  const row = {
    kind: "transient" as const,
    checkout: {
      path: "/repo",
      head: "a".repeat(40),
      branch: "errand/compaction-recovery",
      detached: false,
      primary: false,
    },
    markerGeneration: `sha256:${"b".repeat(64)}`,
    parentCheckoutPath,
    origin: null,
    identity: {
      kind: "errand" as const,
      key: "compaction-recovery",
      claimId: "c".repeat(32),
      protection: "full" as const,
      purpose: "errand" as const,
      origin: "description" as const,
      originEntry: null,
      state: "open" as const,
      branch: "errand/compaction-recovery",
      savedHead: null,
      changeRequest: null,
    },
    context: null,
    lifecycleLocation: null,
    diagnostics: [],
    subject: { kind: "errand" as const, key: "compaction-recovery", claimId: "c".repeat(32) },
  };
  return {
    roster: [row],
    entering: { kind: "selected", row },
    primaryAvailability: { kind: "unsafe", checkoutPath: null, reasons: ["primary-missing"] },
    identityDiscovery: { kind: "complete", identities: [row.identity], diagnostics: [] },
    active: null,
  };
}

function derivedWorkUnitFrame(options: {
  sessionType?: "planning" | "execution" | "prepublication" | "integration";
  workflow?: string;
  loadSet?: LoadSetManifest;
  taskCursor?: typeof CURSOR;
} = {}): DerivedLocusFrame {
  const sessionType = options.sessionType ?? "execution";
  const workflow = options.workflow ?? "process-task-loop";
  const loadSet = options.loadSet ?? LOAD_SET;
  const planningStage: "draft-design" | "create-spec" | "generate-tasks" = workflow === "draft-design"
    || workflow === "create-spec"
    || workflow === "generate-tasks"
    ? workflow
    : "create-spec";
  const row = {
    kind: "work-unit" as const,
    checkout: {
      path: "/repo",
      head: "a".repeat(40),
      branch: "feat/compaction-recovery",
      detached: false,
      primary: false,
    },
    markerGeneration: null,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: {
      kind: "resolved" as const,
      metaPath: ".arc/active/meta-compaction-recovery.md",
      owner: "andrew",
      branch: "feat/compaction-recovery",
      sessionType,
      workflow: sessionType === "planning" ? "planning" : workflow,
      stage: sessionType === "planning" ? planningStage : null,
      taskListPath: ".arc/active/tasks-compaction-recovery.md",
      taskCursor: sessionType === "planning" ? null : options.taskCursor ?? CURSOR,
      cohortDocPath: null,
      loadSet,
      integrationBoundary: null,
    },
    lifecycleLocation: "active" as const,
    diagnostics: [],
    subject: { kind: "work-unit" as const, key: "compaction-recovery" },
  };
  return {
    roster: [row],
    entering: { kind: "selected", row },
    primaryAvailability: { kind: "unsafe", checkoutPath: null, reasons: ["primary-missing"] },
    identityDiscovery: { kind: "absent" },
    active: { checkoutPath: "/repo", subject: row.subject, context: row.context },
  };
}

function unresolvedWorkUnitFrame(): DerivedLocusFrame {
  const resolved = derivedWorkUnitFrame();
  if (resolved.entering.kind !== "selected") throw new Error("expected selected checkout");
  const row = {
    ...resolved.entering.row,
    kind: "unresolved-checkout" as const,
    context: null,
    diagnostics: [{
      code: "topology-mismatch",
      message: "Observed checkout topology does not corroborate the authority-derived subject",
    }],
  };
  return {
    ...resolved,
    roster: [row],
    entering: { kind: "selected", row },
    active: null,
  };
}

function envelope(overrides: Partial<Parameters<typeof emitCompactionSeed>[0]["envelope"]> = {}) {
  return {
    identity: { identity: "andrew" },
    derivedLocusState: { ok: true, value: derivedWorkUnitFrame() },
    worktree: {
      ok: true,
      value: {
        branch: "feat/compaction-recovery",
        identity: { kind: "linked", path: "/repo" },
      },
    },
    active: {
      ok: true,
      value: {
        path: ".arc/active/meta-compaction-recovery.md",
        sessionType: "execution",
        currentWorkflow: "process-task-loop",
      },
    },
    loadSet: { ok: true, value: LOAD_SET },
    extensions: { ok: true, value: { active: [] } },
    taskCursor: {
      ok: true,
      value: {
        status: "found",
        cursor: CURSOR.cursor,
      },
    },
    ...overrides,
  } satisfies Parameters<typeof emitCompactionSeed>[0]["envelope"];
}

async function emit(overrides: {
  uncommittedFiles?: string[];
  snapshotBranch?: string;
  envelope?: Partial<Parameters<typeof emitCompactionSeed>[0]["envelope"]>;
  writeSeed?: (path: string, seed: CompactionSeed) => Promise<void>;
} = {}) {
  return emitCompactionSeed({
    cwd: "/repo",
    envelope: envelope(overrides.envelope),
    gitSnapshot: {
      branch: overrides.snapshotBranch ?? "feat/compaction-recovery",
      head: "72d145021bf4166fa70efc5b9fd11916cf0a359a",
      uncommittedFiles: overrides.uncommittedFiles ?? [],
    },
    writeSeed: overrides.writeSeed ?? vi.fn(async () => undefined),
    now: () => new Date("2026-06-28T12:00:00.000Z"),
  });
}

describe("resolveCompactionSeedPath", () => {
  it("targets the identity-scoped internal seed path", () => {
    expect(resolveCompactionSeedPath({ cwd: "/repo", identity: "andrew" }))
      .toBe(join("/repo", ".arc", "user", "andrew", ".internal", "compaction-seed.json"));
  });

  it("stays worktree-local so concurrent worktrees never share a seed", () => {
    // The seed roots at the active checkout, not a shared identity-global root, so two
    // worktrees of the same identity own distinct seeds and cannot clobber each other.
    expect(resolveCompactionSeedPath({ cwd: "/repo-linked", identity: "andrew" }))
      .toBe(join("/repo-linked", ".arc", "user", "andrew", ".internal", "compaction-seed.json"));
    expect(resolveCompactionSeedPath({ cwd: "/repo-linked", identity: "andrew" }))
      .not.toBe(resolveCompactionSeedPath({ cwd: "/repo", identity: "andrew" }));
  });

  it("rejects identities that would escape the user directory", () => {
    for (const identity of [
      "../andrew",
      "team/andrew",
      "C:andrew",
      ".internal",
      "bad*name",
      "bad?name",
      "bad\"name",
      "bad<name",
      "bad>name",
      "bad|name",
      "bad\nname",
      "bad\rname",
      "bad\tname",
      "bad\u0001name",
      "bad\u007Fname",
      "andrew.",
      "andrew ",
      "CON",
      "NUL",
      "COM1",
      "LPT9",
      "CON.txt",
    ]) {
      expect(() => resolveCompactionSeedPath({ cwd: "/repo", identity }))
        .toThrow("Invalid compaction seed identity");
    }
  });
});

describe("parseUncommittedFiles", () => {
  it("derives a deterministic file list from porcelain-z output", () => {
    expect(
      parseUncommittedFiles([
        "?? zeta.txt",
        "?? Zeta.txt",
        "?? .arc/backlog/provisional/new-stub/",
        " M src/b.ts",
        "R  src/new.ts",
        "src/old.ts",
        "A  src/a.ts",
        "",
      ].join("\0")),
    ).toEqual([
      ".arc/backlog/provisional/new-stub",
      "Zeta.txt",
      "src/a.ts",
      "src/b.ts",
      "src/new.ts",
      "zeta.txt",
    ]);
  });
});

describe("emitCompactionSeed", () => {
  it("persists only the entering checkout and optional marker parent as locus facts", async () => {
    const result = await emit({
      envelope: { derivedLocusState: { ok: true, value: derivedFrame("/repo-parent") } },
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.locus).toEqual({
        checkoutPath: "/repo",
        parentCheckoutPath: "/repo-parent",
      });
      expect(JSON.stringify(result.seed.locus)).not.toMatch(/recordId|leaseId|sessionHomePath/u);
    }
  });

  it("persists physical locus facts without promoting an unresolved subject", async () => {
    const result = await emit({
      snapshotBranch: "main",
      envelope: {
        derivedLocusState: { ok: true, value: unresolvedWorkUnitFrame() },
        active: {
          ok: true,
          value: { path: null, sessionType: null, currentWorkflow: null },
        },
        taskCursor: { ok: true, value: { status: "no-open-task" } },
      },
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.locus).toEqual({ checkoutPath: "/repo", parentCheckoutPath: null });
      expect(result.seed.branch).toBe("main");
      expect(result.seed.activeWorkUnit).toBeNull();
      expect(result.seed.sessionType).toBeNull();
      expect(result.seed.currentWorkflow).toBeNull();
      expect(result.seed.taskCursor).toBeNull();
    }
  });

  it("embeds the load-set manifest supplied by the session-init envelope", async () => {
    const result = await emit();

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.loadSet).toEqual(LOAD_SET);
      expect(result.seed).not.toHaveProperty("harness");
    }
  });

  it("embeds uncommitted files from the supplied git snapshot", async () => {
    const result = await emit({
      uncommittedFiles: [
        ".arc/active/tasks-compaction-recovery.md",
        "packages/arc-framework/src/lib/compaction-seed/emitter.ts",
      ],
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.dirty).toBe(true);
      expect(result.seed.uncommittedFiles).toEqual([
        ".arc/active/tasks-compaction-recovery.md",
        "packages/arc-framework/src/lib/compaction-seed/emitter.ts",
      ]);
    }
  });

  it("canonicalizes untracked directory paths before schema validation", async () => {
    const result = await emit({
      uncommittedFiles: [
        ".arc/backlog/provisional/new-stub/",
        ".arc/backlog/provisional/new-stub",
      ],
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.uncommittedFiles).toEqual([
        ".arc/backlog/provisional/new-stub",
      ]);
    }
  });

  it("populates the execution task cursor from the envelope cursor projection", async () => {
    const result = await emit();

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.taskCursor).toEqual({
        section: {
          id: "2.1",
          title: "Define the task-list cursor",
          lineHint: 66,
        },
        leaf: {
          id: "2.1.a",
          title: "Parse cursor markers",
          lineHint: 70,
        },
      });
    }
  });

  it("preserves segmented plan shape across task consumers and compaction", async () => {
    const structure = scanTaskListStructure(SEGMENTED_COMPATIBILITY_FIXTURE);
    expect(structure.status).toBe("scanned");
    if (structure.status !== "scanned") throw new Error("expected task-list structure");
    expect(structure.events
      .filter((event) => event.type === "parent")
      .map((event) => event.item.id))
      .toEqual(["1.1", "2.1", "2.2", "3.1"]);

    const segmentation = scanTaskListSegmentation({
      path: ".arc/active/tasks-segmented-compatible.md",
      content: SEGMENTED_COMPATIBILITY_FIXTURE,
    });
    expect(segmentation).toMatchObject({
      diagnostics: [],
      segments: [{
        mode: "layer",
        openingPhase: { id: "1" },
        closingPhase: { id: "2" },
        phaseIds: ["1", "2"],
        exitCriterion: { text: "The consumer chain preserves the segmented plan shape." },
      }],
    });

    const analysis = analyzeTaskList(SEGMENTED_COMPATIBILITY_FIXTURE);
    expect(analysis).toEqual({
      status: "found",
      cursor: {
        section: { id: "2.1", title: "Exercise the chain", lineHint: 19 },
        leaf: { id: "2.1.a", title: "Preserve the cursor", lineHint: 23 },
      },
      phaseHeadingLine: 15,
      tallies: {
        phase: { current: 2, total: 3 },
        taskId: "2.1",
        subtask: { current: 1, total: 1 },
        overall: { done: 1, total: 5 },
      },
    });
    if (analysis.status !== "found") throw new Error("expected task-list cursor");

    const inventory = buildDeliveryTaskInventory(SEGMENTED_COMPATIBILITY_FIXTURE);
    expect(inventory).toMatchObject({
      status: "ok",
      inventory: {
        parents: [
          { taskId: "1.1", role: { kind: "implementation" } },
          { taskId: "2.1", role: { kind: "verification", scope: "segment" } },
          { taskId: "2.2", role: { kind: "verification", scope: "member" } },
          { taskId: "3.1", role: { kind: "verification", scope: "work-unit" } },
        ],
      },
    });

    const taskCursor = { status: "found" as const, cursor: analysis.cursor };
    const result = await emit({
      envelope: {
        derivedLocusState: {
          ok: true,
          value: derivedWorkUnitFrame({ taskCursor }),
        },
        taskCursor: { ok: true, value: taskCursor },
      },
    });
    expect(result.status).toBe("written");
    if (result.status === "written") expect(result.seed.taskCursor).toEqual(analysis.cursor);
  });

  it("sets taskCursor to null in planning sessions", async () => {
    const result = await emit({
      envelope: {
        derivedLocusState: { ok: true, value: derivedWorkUnitFrame({
          sessionType: "planning",
          workflow: "create-spec",
        }) },
        active: {
          ok: true,
          value: {
            path: ".arc/active/meta-compaction-recovery.md",
            sessionType: "planning",
            currentWorkflow: "create-spec",
          },
        },
      },
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.taskCursor).toBeNull();
    }
  });

  it("keeps a resolved task cursor for integration sessions", async () => {
    const result = await emit({
      envelope: {
        derivedLocusState: { ok: true, value: derivedWorkUnitFrame({
          sessionType: "integration",
          workflow: "integrate-work-unit Step 4",
        }) },
        active: {
          ok: true,
          value: {
            path: ".arc/active/meta-compaction-recovery.md",
            sessionType: "integration",
            currentWorkflow: "integrate-work-unit Step 4",
          },
        },
      },
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.taskCursor).toEqual({
        section: {
          id: "2.1",
          title: "Define the task-list cursor",
          lineHint: 66,
        },
        leaf: {
          id: "2.1.a",
          title: "Parse cursor markers",
          lineHint: 70,
        },
      });
    }
  });

  it("uses the supplied git snapshot for head and dirty while carrying the resolved branch", async () => {
    const result = await emit({
      uncommittedFiles: ["src/changed.ts"],
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.head).toBe("72d145021bf4166fa70efc5b9fd11916cf0a359a");
      expect(result.seed.branch).toBe("feat/compaction-recovery");
      expect(result.seed.dirty).toBe(true);
    }
  });

  it("keeps the local snapshot branch when the remote-dependent worktree probe is unavailable", async () => {
    // A branch the envelope never carries, so the assertion proves the local snapshot
    // was the source rather than matching whatever the worktree probe would have said.
    const result = await emit({
      snapshotBranch: "feat/local-snapshot-only",
      envelope: {
        worktree: { ok: false, error: new Error("remote snapshot unavailable") },
      },
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.branch).toBe("feat/local-snapshot-only");
    }
  });

  it("uses currentWorkflow from the resolved active envelope without rereading the meta", async () => {
    const result = await emit({
      envelope: {
        derivedLocusState: { ok: true, value: derivedWorkUnitFrame({
          sessionType: "integration",
          workflow: "integrate-work-unit Step 4",
        }) },
        active: {
          ok: true,
          value: {
            path: ".arc/active/meta-compaction-recovery.md",
            sessionType: "integration",
            currentWorkflow: "integrate-work-unit Step 4",
          },
        },
      },
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.currentWorkflow).toBe("integrate-work-unit Step 4");
    }
  });

  it("round-trips the written seed losslessly through JSON", async () => {
    let written: CompactionSeed | null = null;
    const result = await emit({
      writeSeed: vi.fn(async (_path, seed) => { written = seed; }),
    });

    expect(result.status).toBe("written");
    expect(written).not.toBeNull();
    const parsed = parseCompactionSeedJson(stringifyCompactionSeed(written!));
    expect(parsed).toEqual({ ok: true, seed: written });
  });

  it("fails before writing when the generated seed violates the schema", async () => {
    const writeSeed = vi.fn();
    const result = await emit({
      envelope: {
        derivedLocusState: { ok: true, value: derivedWorkUnitFrame({
          loadSet: {
            ...LOAD_SET,
            entries: [{ path: "../escape.md", readMode: { kind: "full" } }],
          } as LoadSetManifest,
        }) },
        loadSet: {
          ok: true,
          value: {
            ...LOAD_SET,
            entries: [
              {
                path: "../escape.md",
                readMode: { kind: "full" },
              },
            ],
          } as LoadSetManifest,
        },
      },
      writeSeed,
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "seed-invalid",
    });
    expect(writeSeed).not.toHaveBeenCalled();
  });

  it("returns a failed write result instead of throwing when persistence fails", async () => {
    await expect(
      emit({
        writeSeed: vi.fn(async () => {
          throw new Error("disk full");
        }),
      }),
    ).resolves.toMatchObject({
      status: "failed",
      reason: "write-failed",
    });
  });

  it("skips without touching git or fs when identity is absent", async () => {
    const writeSeed = vi.fn();

    const result = await emitCompactionSeed({
      cwd: "/repo",
      envelope: envelope({ identity: { identity: null } }),
      gitSnapshot: {
        branch: "feat/compaction-recovery",
        head: "72d145021bf4166fa70efc5b9fd11916cf0a359a",
        uncommittedFiles: [],
      },
      writeSeed,
      now: () => new Date("2026-06-28T12:00:00.000Z"),
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "identity-missing",
    });
    expect(writeSeed).not.toHaveBeenCalled();
  });

  it("fails without writing when the configured identity is not a safe segment", async () => {
    const writeSeed = vi.fn();

    const result = await emit({
      envelope: {
        identity: { identity: "../andrew" },
      },
      writeSeed,
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "identity-invalid",
    });
    expect(writeSeed).not.toHaveBeenCalled();
  });
});
