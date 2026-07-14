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
import type { MetaFieldName, MetaFieldOverrides } from "../../../src/lib/active/meta-reader.js";
import {
  buildGraduateCeremonyCommitMessage,
  runGraduate,
  type GraduateParams,
} from "../../../src/commands/start.js";

const CWD = "/repo";

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
  overrides: MetaFieldOverrides;
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

  return { ctx, calls, reconcileCalls, stageWrites, softWrites, stagedMetas, worktreeOps, classWrites };
}

const BASE = {
  name: "widget",
  baseBranch: "main",
  locationTemplate: "../{repo}-{branch}",
  repo: "arc-framework",
  spawningIdentity: "andrew",
} satisfies Omit<Extract<GraduateParams, { inPlace?: false }>, "cls">;

describe("runGraduate — backlog stub onto its branch", () => {
  it("builds the formulaic ceremony commit message", () => {
    expect(buildGraduateCeremonyCommitMessage("widget")).toBe(
      "chore(arc): graduate widget into active\n\n" +
        "Context: meta-widget.md (activation)\n",
    );
  });

  it("relocates a provisional stub to active/ and spawns its plan/ branch", async () => {
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
    expect(calls).toContain("relocate:.arc/backlog/provisional/widget->.arc/active");
    expect(calls).toContain("worktree:spawn");
    expect(calls).toContain("worktree:spawn:in-place");
    expect(calls).toContain("relocate-cwd:/repo/../wt");
    expect(calls.indexOf("worktree:spawn")).toBeLessThan(calls.indexOf("relocate-cwd:/repo/../wt"));
    expect(calls.some((c) => c.startsWith("session-seed:") && c.includes("meta-widget.md"))).toBe(true);
  });

  it("relocates a planned stub too (name-collision → graduate)", async () => {
    const { ctx, calls } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Heavy" },
    ]);

    const result = await runGraduate(ctx, { ...BASE, cls: "Heavy" });

    expect(result.status).toBe("graduated");
    expect(calls).toContain("relocate:.arc/backlog/planned/widget->.arc/active");
  });

  it("threads the configured post-create script into spawned graduate worktrees", async () => {
    const { ctx, worktreeOps } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Light" },
    ]);

    const result = await runGraduate(ctx, { ...BASE, cls: "Light", postCreateScript: "npm run setup:worktree" });

    expect(result.status).toBe("graduated");
    expect(worktreeOps[0]).toMatchObject({ mutation: "spawn", postCreateScript: "npm run setup:worktree" });
  });

  it("graduates in place (no worktree spawned) when inPlace is set", async () => {
    const { ctx, calls } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Novel" },
    ]);

    const result = await runGraduate(ctx, { name: "widget", cls: "Novel", inPlace: true });

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    expect(result.branch).toBe("plan/widget");
    expect(result.metaPath).toBe(".arc/active/meta-widget.md");
    // Relocate + in-place worktree placement (checkout -b) fire; no fresh worktree is spawned.
    expect(calls).toContain("relocate:.arc/backlog/planned/widget->.arc/active");
    expect(calls).toContain(`relocate-cwd:${CWD}`);
    expect(calls).toContain("worktree:spawn:in-place");
    expect(calls).not.toContain("worktree:spawn");
  });

  it("refuses an in-place graduate into a checkout that already holds an active WU", async () => {
    const { ctx, calls } = buildCtx(
      [{ slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Novel" }],
      /* occupancyOk */ false,
    );

    const result = await runGraduate(ctx, { name: "widget", cls: "Novel", inPlace: true });

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

  it("persists a caller-supplied Class into the relocated meta (writeClass) and stages it", async () => {
    const { ctx, calls, classWrites, stagedMetas } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "[TBD]" },
    ]);

    // The `--class` path: the stub's meta is still `[TBD]`, the caller resolved it.
    const result = await runGraduate(ctx, { ...BASE, cls: "Light", writeClass: true });

    expect(result.status).toBe("graduated");
    expect(classWrites).toEqual([{ metaPath: ".arc/active/meta-widget.md", value: "Light" }]);
    // The Class write lands before the final post-transition staging, so the
    // ceremony commit carries it (the transition legs stage earlier passes too).
    expect(calls.indexOf("class-write")).toBeLessThan(calls.lastIndexOf("stage-meta"));
    expect(stagedMetas).toContain(".arc/active/meta-widget.md");
  });

  it("performs no Class write when writeClass is not set", async () => {
    const { ctx, classWrites } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Light" },
    ]);

    const result = await runGraduate(ctx, { ...BASE, cls: "Light" });

    expect(result.status).toBe("graduated");
    expect(classWrites).toEqual([]);
  });

  it("rejects writeClass when the executor lacks the Class-write seam (wiring error)", async () => {
    const { ctx, calls, classWrites } = buildCtx(
      [{ slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "[TBD]" }],
      /* occupancyOk */ true,
      /* reconcileBackfill */ [],
      /* withClassSeam */ false,
    );

    const result = await runGraduate(ctx, { name: "widget", cls: "Light", writeClass: true, inPlace: true });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/Class-write seam/i);
    expect(classWrites).toEqual([]);
    // The refusal fires post-transition: relocate, worktree placement, and the
    // meta reconcile have already run — the wiring error rejects the ceremony's
    // Class write, it does not roll the transition back.
    expect(calls).toContain("relocate:.arc/backlog/planned/widget->.arc/active");
    expect(calls).toContain("worktree:spawn:in-place");
    expect(calls).toContain("reconcile-meta");
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

    const result = await runGraduate(ctx, { name: "widget", cls: "Light", inPlace: true });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toContain("closing `---`");
    expect(calls.some((c) => c.startsWith("worktree:") || c.startsWith("relocate:"))).toBe(false);
  });

  it("forward-reconciles the relocated meta with the planning-entry pointer and surfaces the count notice", async () => {
    const { ctx, reconcileCalls } = buildCtx(
      [{ slug: "widget", tier: "backlog/provisional", subdir: "widget", state: "Planning", cls: "Light" }],
      /* occupancyOk */ true,
      /* reconcileBackfill */ ["Current Workflow", "Origin"],
    );

    const result = await runGraduate(ctx, { ...BASE, cls: "Light" });

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    // The reconcile runs against the relocated `active/` meta, carrying the
    // planning-entry `Current Workflow` value (not the template's `[none]`).
    expect(reconcileCalls).toHaveLength(1);
    expect(reconcileCalls[0]!.metaPath).toBe(".arc/active/meta-widget.md");
    expect(reconcileCalls[0]!.overrides).toEqual({ "Current Workflow": "draft-design" });
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

  it("sets the planning-entry stage pointer even when reconcile no-ops on a present `[none]`", async () => {
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
    expect(stageWrites).toEqual([{ metaPath: ".arc/active/meta-widget.md", stage: "draft-design" }]);
    // Ordering is load-bearing: the stage write is fail-loud on an absent bullet, so
    // it must run *after* the reconcile inserts a missing field (pre-field meta case).
    expect(calls.indexOf("reconcile-meta")).toBeLessThan(calls.indexOf("stage-write"));
  });

  it("resets Next Action to the begin-current-workflow sentinel for shell-complete start", async () => {
    const { ctx, calls, softWrites } = buildCtx(
      [{ slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Heavy" }],
      /* occupancyOk */ true,
      /* reconcileBackfill */ [],
    );

    const result = await runGraduate(ctx, { ...BASE, cls: "Heavy" });

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    expect(softWrites).toContainEqual({
      metaPath: ".arc/active/meta-widget.md",
      updates: { "Next Action": "[begin current workflow]" },
    });
    expect(calls.indexOf("stage-write")).toBeLessThan(calls.indexOf("soft:Next Action"));
  });

  it("stages the post-transition planning pointer rewrites", async () => {
    const { ctx, calls, stagedMetas } = buildCtx(
      [{ slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Heavy" }],
      /* occupancyOk */ true,
      /* reconcileBackfill */ [],
    );

    const result = await runGraduate(ctx, { ...BASE, cls: "Heavy" });

    expect(result.status).toBe("graduated");
    if (result.status !== "graduated") return;
    expect(stagedMetas).toEqual([".arc/active/meta-widget.md", ".arc/active/meta-widget.md"]);
    expect(calls.indexOf("soft:Next Action")).toBeLessThan(calls.lastIndexOf("stage-meta"));
  });
});
