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

import type { ExecuteTransitionContext, SideEffectHandler } from "../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../src/lib/work-unit/lifecycle-transitions.js";
import { runGraduate, type GraduateParams } from "../../../src/commands/start.js";

const CWD = "/repo";

interface MetaSpec {
  slug: string;
  tier: string;
  subdir: string;
  state: string;
  cls?: string;
  branch?: string;
}

/** Build an injectable index fs over a fixed set of metas (mirrors the park/resume harness). */
function buildIndexFs(metas: MetaSpec[]): LifecycleIndexFs {
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
    const tierAbs = `${CWD}/.arc/${meta.tier}`;
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
        `- **Next Action:** begin.\n\n---\n`,
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

interface Harness {
  ctx: ExecuteTransitionContext;
  calls: string[];
}

function buildCtx(metas: MetaSpec[], occupancyOk = true): Harness {
  const calls: string[] = [];

  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user", "user-workspace"] satisfies SideEffectId[]) {
    sideEffects[id] = () => {
      calls.push(`side:${id}`);
      return undefined;
    };
  }

  const ctx: ExecuteTransitionContext = {
    cwd: CWD,
    indexFs: buildIndexFs(metas),
    setPhase: async () => ({ phase: "Planning" }),
    relocateArtifacts: async (params) => {
      calls.push(`relocate:${params.fromDir}->${params.toDir}`);
      return { moved: [`meta-${params.slug}.md`] };
    },
    reconcileBranch: async (op) => {
      calls.push(`branch:${op.mutation}`);
    },
    reconcileWorktree: async (op) => {
      calls.push(op.mutation === "spawn" && op.inPlace ? "worktree:spawn:in-place" : `worktree:${op.mutation}`);
      return op.mutation === "spawn"
        ? { mutation: "spawn", worktreePath: "/repo/../wt", branch: op.branch }
        : { mutation: "teardown", worktreePath: "", locusHopped: false };
    },
    writeBranchField: async () => {},
    writeCurrentWorkflowField: async () => {},
    writeSoftFields: async (path, updates) => {
      calls.push(`soft:${Object.keys(updates).join(",")}`);
    },
    sideEffects,
    guardValidators: {
      "worktree-occupancy": () =>
        occupancyOk ? { ok: true } : { ok: false, message: "worktree already holds an active work unit `other`." },
    },
  };

  return { ctx, calls };
}

const BASE = {
  name: "widget",
  baseBranch: "main",
  locationTemplate: "../{repo}-{branch}",
  repo: "arc-framework",
  spawningIdentity: "andrew",
} satisfies Omit<Extract<GraduateParams, { inPlace?: false }>, "cls">;

describe("runGraduate — backlog stub onto its branch", () => {
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
  });

  it("relocates a planned stub too (name-collision → graduate)", async () => {
    const { ctx, calls } = buildCtx([
      { slug: "widget", tier: "backlog/planned", subdir: "widget", state: "Planning", cls: "Heavy" },
    ]);

    const result = await runGraduate(ctx, { ...BASE, cls: "Heavy" });

    expect(result.status).toBe("graduated");
    expect(calls).toContain("relocate:.arc/backlog/planned/widget->.arc/active");
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
});
