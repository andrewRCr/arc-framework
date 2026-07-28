/**
 * Unit tests for `runGraduate` — the `start` arm that brings a backlog stub onto
 * its branch (`init` Path A). It routes through `executeTransition` as the `start`
 * verb: the relocate leg moves the artifact set `backlog → active`, the
 * worktree-spawn leg cuts `plan/<name>` and spawns the worktree, and the
 * `class-resolved` guard refuses a stub still carrying an unresolved `Class`.
 * The executor's mutators reach the arm as spies over an in-memory index, so each
 * leg + guard is asserted without a real worktree.
 */

import { describe, it, expect } from "vitest";
import { normalize } from "node:path";

import type { ExecuteTransitionContext, SideEffectHandler } from "../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../src/lib/work-unit/lifecycle-transitions.js";
import type { MetaFieldName, MetaProjectionOverrides } from "../../../src/lib/active/meta-reader.js";
import {
  buildGraduateCeremonyCommitMessage,
  runGraduate,
  type GraduateParams,
} from "../../../src/commands/start.js";
import type { ValidatedGraduationTransaction } from "../../../src/lib/work-unit/validated-graduation-transaction.js";

const CWD = "/repo";
function transaction(mode: "spawned" | "in-place" = "spawned"): ValidatedGraduationTransaction {
  return {
    kind: "validated-graduation-transaction",
    schemaVersion: 1,
    slug: "widget",
    branch: "plan/widget",
    source: {
      location: "planned",
      directory: ".arc/backlog/planned/widget",
      metaPath: ".arc/backlog/planned/widget/meta-widget.md",
      artifacts: [],
    },
    target: {
      directory: ".arc/active",
      metaPath: ".arc/active/meta-widget.md",
      metaBytes: new Uint8Array(),
      artifacts: [],
      pathStates: [],
    },
    policy: {
      provenance: "ordinary",
      profile: { kind: "draft", sourceDesign: ["draft-widget.md"] },
      taskAuthority: "none",
      workflow: { kind: "preserved", value: "draft-design" },
      class: { kind: "preserved", value: "Light" },
      decompositionReceiptRemoved: false,
    },
    reconciliation: { backfilled: [], notice: null },
    occupation: {
      mode,
      baseHead: "a".repeat(40),
      branch: { kind: "absent", ref: "refs/heads/plan/widget" },
      worktree: mode === "spawned"
        ? { kind: "absent", path: "/repo/../wt" }
        : { kind: "current", path: CWD, head: "a".repeat(40), branch: "main" },
      indexTree: "b".repeat(40),
      operation: mode === "spawned"
        ? {
            kind: "spawned",
            branch: "plan/widget",
            base: "a".repeat(40),
            worktreePath: "/repo/../wt",
            locationTemplate: "../{repo}-{branch}",
            repo: "arc-framework",
            wuName: "widget",
            spawningIdentity: "andrew",
          }
        : { kind: "in-place", branch: "plan/widget", worktreePath: CWD },
    },
  };
}

const PREPARE_TRANSACTION = async () => ({
  status: "ready" as const,
  transaction: transaction(),
});
const PREPARE_IN_PLACE_TRANSACTION = async () => ({
  status: "ready" as const,
  transaction: transaction("in-place"),
});

interface MetaSpec {
  slug: string;
  tier: string;
  subdir: string;
  state: string;
  cls?: string;
  branch?: string;
  closingRule?: boolean;
}

/** Build an injectable index fs over a fixed set of metas (mirrors the park/resume harness). */
function buildIndexFs(metas: MetaSpec[], root = CWD): LifecycleIndexFs {
  const normalizedRoot = normalize(root);
  const dirs = new Map<string, DirEntry[]>();
  const files = new Map<string, string>();

  const ensureDir = (dir: string): DirEntry[] => {
    let entries = dirs.get(dir);
    if (entries === undefined) {
      entries = [];
      dirs.set(dir, entries);
    }
    return entries;
  };
  const addChildDir = (parent: string, name: string): void => {
    const entries = ensureDir(parent);
    if (!entries.some((e) => e.name === name && e.isDirectory())) {
      entries.push({ name, isDirectory: () => true });
    }
  };

  for (const meta of metas) {
    const tierAbs = `${normalizedRoot}/.arc/${meta.tier}`;
    let dirAbs = tierAbs;
    let parent = tierAbs;
    for (const seg of meta.subdir.split("/").filter((s) => s !== "")) {
      addChildDir(parent, seg);
      parent = `${parent}/${seg}`;
      dirAbs = parent;
    }
    const filename = `meta-${meta.slug}.md`;
    ensureDir(dirAbs).push({ name: filename, isDirectory: () => false });
    files.set(
      `${dirAbs}/${filename}`,
      `# Metadata: ${meta.slug}\n\n` +
        `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
        `|-----------|-----------|------------|-----------|--------------|\n` +
        `| \`${meta.state}\` | \`andrew\` | \`${meta.branch ?? "[none]"}\` | \`${meta.cls ?? "Novel"}\` | \`P1\` |\n\n` +
        `- **Cohort:** [none]\n- **Depends On:** [none]\n\n` +
        `- **Last Completed:** [none]\n- **Next Task:** [none]\n- **Blockers:** [none]\n\n` +
        `- **Next Action:** begin.\n\n` +
        (meta.closingRule === false ? "" : "---\n"),
    );
  }

  return {
    readdir: (path) => {
      const entries = dirs.get(path);
      return entries === undefined ? Promise.reject(new Error(`ENOENT: ${path}`)) : Promise.resolve(entries);
    },
    readFile: (path) => {
      const content = files.get(path);
      return content === undefined ? Promise.reject(new Error(`ENOENT: ${path}`)) : Promise.resolve(content);
    },
  };
}

interface ReconcileCall {
  metaPath: string;
  overrides: MetaProjectionOverrides;
}

interface StageWrite {
  metaPath: string;
  stage: string;
}

interface SoftWrite {
  metaPath: string;
  updates: Partial<Record<MetaFieldName, string>>;
}

interface ClassWrite {
  metaPath: string;
  value: string;
}

interface Harness {
  ctx: ExecuteTransitionContext;
  calls: string[];
  reconcileCalls: ReconcileCall[];
  stageWrites: StageWrite[];
  softWrites: SoftWrite[];
  stagedMetas: string[];
  worktreeOps: unknown[];
  classWrites: ClassWrite[];
  atomicTransactions: ValidatedGraduationTransaction[];
}

function buildCtx(
  metas: MetaSpec[],
  occupancyOk = true,
  reconcileBackfill: MetaFieldName[] = [],
  withClassSeam = true,
): Harness {
  const calls: string[] = [];
  const reconcileCalls: ReconcileCall[] = [];
  const stageWrites: StageWrite[] = [];
  const softWrites: SoftWrite[] = [];
  const stagedMetas: string[] = [];
  const worktreeOps: unknown[] = [];
  const classWrites: ClassWrite[] = [];
  const atomicTransactions: ValidatedGraduationTransaction[] = [];

  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user", "user-workspace"] satisfies SideEffectId[]) {
    sideEffects[id] = ({ inputs }) => {
      calls.push(`side:${id}`);
      if (id === "user-workspace" && inputs.sessionNotesSeed !== undefined) {
        calls.push(`session-seed:${inputs.sessionNotesSeed}`);
      }
      return undefined;
    };
  }

  const makeCtx = (cwd: string): ExecuteTransitionContext => ({
    cwd,
    withCwd: (nextCwd) => makeCtx(nextCwd),
    indexFs: buildIndexFs(metas, cwd),
    setPhase: async () => ({ phase: "Planning" }),
    relocateArtifacts: async (params) => {
      calls.push(`relocate:${params.fromDir}->${params.toDir}`);
      calls.push(`relocate-cwd:${cwd}`);
      return { moved: [`meta-${params.slug}.md`] };
    },
    reconcileBranch: async (op) => {
      calls.push(`branch:${op.mutation}`);
    },
    reconcileWorktree: async (op) => {
      worktreeOps.push(op);
      calls.push(op.mutation === "spawn" && op.inPlace ? "worktree:spawn:in-place" : `worktree:${op.mutation}`);
      return op.mutation === "spawn"
        ? { mutation: "spawn", worktreePath: op.inPlace ? cwd : "/repo/../wt", branch: op.branch }
        : { mutation: "teardown", worktreePath: "", locusHopped: false };
    },
    atomicGraduate: async (graduation) => {
      calls.push("atomic-graduate");
      atomicTransactions.push(graduation);
      return {
        status: "applied",
        worktreePath: graduation.occupation.operation.worktreePath,
        postCreateNotice: null,
      };
    },
    writeBranchField: async () => {},
    ...(withClassSeam
      ? {
          writeClassField: async (metaPath: string, value: string) => {
            calls.push("class-write");
            classWrites.push({ metaPath, value });
          },
        }
      : {}),
    writeCurrentWorkflowField: async (metaPath, stage) => {
      calls.push("stage-write");
      stageWrites.push({ metaPath, stage });
    },
    writeDesignField: async () => {},
    writeSoftFields: async (path, updates) => {
      calls.push(`soft:${Object.keys(updates).join(",")}`);
      softWrites.push({ metaPath: path, updates });
    },
    reconcileMeta: async (metaPath, overrides) => {
      calls.push("reconcile-meta");
      reconcileCalls.push({ metaPath, overrides });
      return reconcileBackfill;
    },
    stageMeta: async (metaPath) => {
      calls.push("stage-meta");
      stagedMetas.push(metaPath);
    },
    sideEffects,
    guardValidators: {
      "worktree-occupancy": () =>
        occupancyOk ? { ok: true } : { ok: false, message: "worktree already holds an active work unit `other`." },
    },
  });
  const ctx = makeCtx(CWD);

  return {
    ctx,
    calls,
    reconcileCalls,
    stageWrites,
    softWrites,
    stagedMetas,
    worktreeOps,
    classWrites,
    atomicTransactions,
  };
}

const BASE = {
  name: "widget",
  baseBranch: "main",
  locationTemplate: "../{repo}-{branch}",
  repo: "arc-framework",
  spawningIdentity: "andrew",
  prepareTransaction: PREPARE_TRANSACTION,
} satisfies Omit<Extract<GraduateParams, { inPlace?: false }>, "cls">;

describe("runGraduate — backlog stub onto its branch", () => {
  it("builds the formulaic ceremony commit message", () => {
    expect(buildGraduateCeremonyCommitMessage("widget")).toBe(
      "chore(arc): graduate widget into active\n\n" +
        "Context: meta-widget.md (activation)\n",
    );
  });

  it("sends a provisional stub through one atomic graduation port", async () => {
    const { ctx, calls } = buildCtx([
      { slug: "widget", tier: "backlog/provisional", subdir: "widget", state: "Planning", cls: "Light" },
    ]);

    const result = await runGraduate(ctx, { ...BASE, cls: "Light" });

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    expect(result.branch).toBe("plan/widget");
    expect(result.metaPath).toBe(".arc/active/meta-widget.md");
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("start");
      expect(result.outcome.to).toEqual({ phase: "Planning", location: "active" });
    }
    expect(calls).toContain("atomic-graduate");
    expect(calls.some((call) => call.startsWith("relocate:") || call.startsWith("worktree:"))).toBe(false);
    expect(calls.some((c) => c.startsWith("session-seed:") && c.includes("meta-widget.md"))).toBe(true);
  });

  it("relocates a planned stub too (name-collision → graduate)", async () => {
    const { ctx, calls } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Heavy" },
    ]);

    const result = await runGraduate(ctx, { ...BASE, cls: "Heavy" });

    expect(result.status).toBe("graduated");
    expect(calls).toContain("atomic-graduate");
  });

  it("threads the configured post-create script into spawned graduate worktrees", async () => {
    const { ctx, atomicTransactions } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Light" },
    ]);

    const configured = transaction();
    if (configured.occupation.operation.kind !== "spawned") throw new Error("fixture mode");
    configured.occupation.operation.postCreateScript = "npm run setup:worktree";
    const result = await runGraduate(ctx, {
      ...BASE,
      cls: "Light",
      postCreateScript: "npm run setup:worktree",
      prepareTransaction: async () => ({ status: "ready", transaction: configured }),
    });

    expect(result.status).toBe("graduated");
    expect(atomicTransactions[0]?.occupation.operation).toMatchObject({
      kind: "spawned",
      postCreateScript: "npm run setup:worktree",
    });
  });

  it("graduates in place (no worktree spawned) when inPlace is set", async () => {
    const { ctx, calls } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Novel" },
    ]);

    const result = await runGraduate(ctx, {
      name: "widget", cls: "Novel", inPlace: true, prepareTransaction: PREPARE_IN_PLACE_TRANSACTION,
    });

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    expect(result.branch).toBe("plan/widget");
    expect(result.metaPath).toBe(".arc/active/meta-widget.md");
    expect(calls).toContain("atomic-graduate");
    expect(calls.some((call) => call.startsWith("relocate:") || call.startsWith("worktree:"))).toBe(false);
  });

  it("refuses an in-place graduate into a checkout that already holds an active WU", async () => {
    const { ctx, calls } = buildCtx(
      [{ slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Novel" }],
      /* occupancyOk */ false,
    );

    const result = await runGraduate(ctx, {
      name: "widget", cls: "Novel", inPlace: true, prepareTransaction: PREPARE_IN_PLACE_TRANSACTION,
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/already holds an active work unit/i);
    // Refusal is total — no relocate, no worktree placement.
    expect(calls.some((c) => c.startsWith("relocate:") || c.startsWith("worktree:"))).toBe(false);
  });

  it("rejects when the Class is unresolved ([TBD]) — the class-resolved guard", async () => {
    const { ctx, calls } = buildCtx([
      { slug: "widget", tier: "backlog/provisional", subdir: "widget", state: "Planning", cls: "[TBD]" },
    ]);

    const result = await runGraduate(ctx, { ...BASE, cls: "[TBD]" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/class/i);
    // Refusal is total — no relocate, no spawn.
    expect(calls.some((c) => c.startsWith("relocate:") || c.startsWith("worktree:"))).toBe(false);
  });

  it("refuses transaction drift before either start arm can mutate", async () => {
    for (const params of [
      { ...BASE, cls: "Light" },
      {
        name: "widget",
        cls: "Light",
        inPlace: true as const,
        prepareTransaction: PREPARE_IN_PLACE_TRANSACTION,
      },
    ]) {
      const { ctx, calls } = buildCtx([
        { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Light" },
      ]);
      const result = await runGraduate(ctx, {
        ...params,
        prepareTransaction: async () => ({
          status: "refused",
          reason: "snapshot-drift",
          locus: ".arc/backlog/planned/widget",
          detail: "source bytes changed",
        }),
      });

      expect(result).toMatchObject({ status: "rejected", reason: expect.stringContaining("snapshot-drift") });
      expect(calls.some((call) =>
        call.startsWith("worktree:")
        || call.startsWith("relocate:")
        || call === "reconcile-meta"
        || call === "stage-meta")).toBe(false);
    }
  });

  it("returns typed recovery residue without firing successful side effects", async () => {
    const { ctx, calls } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Light" },
    ]);
    ctx.atomicGraduate = async () => ({
      status: "graduation-recovery-required",
      reason: "rollback could not remove the branch",
      residue: {
        slug: "widget",
        branch: "plan/widget",
        mode: "in-place",
        failures: [{ stage: "branch", locus: "refs/heads/plan/widget", detail: "ref changed" }],
      },
    });

    const result = await runGraduate(ctx, {
      name: "widget",
      cls: "Light",
      inPlace: true,
      prepareTransaction: PREPARE_IN_PLACE_TRANSACTION,
    });

    expect(result).toMatchObject({
      status: "graduation-recovery-required",
      residue: {
        failures: [expect.objectContaining({ stage: "branch" })],
      },
    });
    expect(calls.some((call) => call.startsWith("side:"))).toBe(false);
  });

  it("carries caller-supplied Class inside the transaction without a later Class write", async () => {
    const { ctx, calls, classWrites, stagedMetas } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "[TBD]" },
    ]);

    // The `--class` path: the stub's meta is still `[TBD]`, the caller resolved it.
    const supplied = transaction();
    supplied.policy.class = { kind: "supplied", value: "Light" };
    const result = await runGraduate(ctx, {
      ...BASE,
      cls: "Light",
      writeClass: true,
      prepareTransaction: async () => ({ status: "ready", transaction: supplied }),
    });

    expect(result.status).toBe("graduated");
    expect(classWrites).toEqual([]);
    expect(stagedMetas).toEqual([]);
    expect(calls).toContain("atomic-graduate");
  });

  it("performs no Class write when writeClass is not set", async () => {
    const { ctx, classWrites } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Light" },
    ]);

    const result = await runGraduate(ctx, { ...BASE, cls: "Light" });

    expect(result.status).toBe("graduated");
    expect(classWrites).toEqual([]);
  });

  it("does not require the generic Class-write seam for a supplied Class", async () => {
    const { ctx, calls, classWrites } = buildCtx(
      [{ slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "[TBD]" }],
      /* occupancyOk */ true,
      /* reconcileBackfill */ [],
      /* withClassSeam */ false,
    );

    const result = await runGraduate(ctx, {
      name: "widget",
      cls: "Light",
      writeClass: true,
      inPlace: true,
      prepareTransaction: PREPARE_IN_PLACE_TRANSACTION,
    });

    expect(result.status).toBe("graduated");
    expect(classWrites).toEqual([]);
    expect(calls).toContain("atomic-graduate");
    expect(calls).not.toContain("reconcile-meta");
  });

  it("rejects an old-shape meta before spawning or relocating", async () => {
    const { ctx, calls } = buildCtx([
      {
        slug: "widget",
        tier: "backlog/planned",
        subdir: "widget",
        state: "Planning",
        cls: "Light",
        closingRule: false,
      },
    ]);

    const result = await runGraduate(ctx, { ...BASE, cls: "Light" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toContain("closing `---`");
    expect(
      calls.some(
        (c) =>
          c.startsWith("relocate:")
          || c.startsWith("worktree:")
          || c === "branch:create"
          || c === "reconcile-meta"
          || c === "stage-write",
      ),
    ).toBe(false);
  });

  it("rejects an old-shape meta before in-place branch mutation", async () => {
    const { ctx, calls } = buildCtx([
      {
        slug: "widget",
        tier: "backlog/planned",
        subdir: "widget",
        state: "Planning",
        cls: "Light",
        closingRule: false,
      },
    ]);

    const result = await runGraduate(ctx, {
      name: "widget", cls: "Light", inPlace: true, prepareTransaction: PREPARE_IN_PLACE_TRANSACTION,
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toContain("closing `---`");
    expect(calls.some((c) => c.startsWith("worktree:") || c.startsWith("relocate:"))).toBe(false);
  });

  it("returns the transaction's precomputed backfill surface without post-application reconcile", async () => {
    const { ctx, reconcileCalls } = buildCtx(
      [{ slug: "widget", tier: "backlog/provisional", subdir: "widget", state: "Planning", cls: "Light" }],
      /* occupancyOk */ true,
      /* reconcileBackfill */ ["Current Workflow", "Origin"],
    );

    const prepared = transaction();
    prepared.reconciliation = {
      backfilled: ["Current Workflow", "Origin"],
      notice: "Backfilled 2 meta field(s) against the code field model: Current Workflow, Origin.",
    };
    const result = await runGraduate(ctx, {
      ...BASE,
      cls: "Light",
      prepareTransaction: async () => ({ status: "ready", transaction: prepared }),
    });

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    expect(reconcileCalls).toHaveLength(0);
    expect(result.backfilled).toEqual(["Current Workflow", "Origin"]);
    expect(result.notice).toMatch(/[Bb]ackfilled 2 .*field/);
  });

  it("emits no notice when the relocated meta is already complete (reconcile no-op)", async () => {
    const { ctx } = buildCtx(
      [{ slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Heavy" }],
      /* occupancyOk */ true,
      /* reconcileBackfill */ [],
    );

    const result = await runGraduate(ctx, { ...BASE, cls: "Heavy" });

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    expect(result.backfilled).toEqual([]);
    expect(result.notice).toBeNull();
  });

  it("performs no generic planning-stage write after the atomic port applies", async () => {
    // The bug this guards: a stub-minted meta carries a present `Current Workflow:
    // [none]`, so the insert-absent-only reconcile can't advance it — `backfilled`
    // is empty, yet the dedicated stage write must still set the planning entry.
    const { ctx, calls, stageWrites } = buildCtx(
      [{ slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Heavy" }],
      /* occupancyOk */ true,
      /* reconcileBackfill */ [],
    );

    const result = await runGraduate(ctx, { ...BASE, cls: "Heavy" });

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    expect(result.backfilled).toEqual([]);
    expect(stageWrites).toEqual([]);
    expect(calls).not.toContain("reconcile-meta");
  });

  it("performs no generic soft-field write after the atomic port applies", async () => {
    const { ctx, softWrites } = buildCtx(
      [{ slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Heavy" }],
      /* occupancyOk */ true,
      /* reconcileBackfill */ [],
    );

    const result = await runGraduate(ctx, { ...BASE, cls: "Heavy" });

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    expect(softWrites).toEqual([]);
  });

  it("performs no generic post-transition meta staging", async () => {
    const { ctx, calls, stagedMetas } = buildCtx(
      [{ slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Heavy" }],
      /* occupancyOk */ true,
      /* reconcileBackfill */ [],
    );

    const result = await runGraduate(ctx, { ...BASE, cls: "Heavy" });

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    expect(stagedMetas).toEqual([]);
    expect(calls).toContain("atomic-graduate");
  });
});
