/**
 * Unit tests for cross-machine WU materialize.
 *
 * The authoritative active work-unit artifacts already ride the fetched remote
 * branch. Materialize therefore applies only machine-local checkout placement;
 * the local backlog projection neither authorizes nor blocks that operation.
 */

import { describe, expect, it } from "vitest";

import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import type { MetaFileCandidate } from "../../../../src/commands/active/types.js";
import { makeWorktreeOccupancyGuard } from "../../../../src/lib/work-unit/lifecycle-guards.js";
import { runMaterialize } from "../../../../src/lib/work-unit/verbs/materialize.js";

const CWD = "/repo";
const WORKTREE = "/repo/../wt-foo";

function emptyIndexFs(): LifecycleIndexFs {
  return {
    readdir: (path) =>
      path.endsWith("/.arc/active") || path.endsWith("/.arc/backlog/planned") || path.endsWith("/.arc/backlog/provisional")
        ? Promise.resolve([] as DirEntry[])
        : Promise.reject(new Error(`ENOENT: ${path}`)),
    readFile: (path) => Promise.reject(new Error(`ENOENT: ${path}`)),
  };
}

function candidate(over: Partial<MetaFileCandidate>): MetaFileCandidate {
  return {
    path: ".arc/active/meta-other.md",
    filename: "meta-other.md",
    branch: "feat/other",
    state: "Active",
    nextTask: null,
    taskList: null,
    nextAction: null,
    currentWorkflow: null,
    ...over,
  };
}

function buildCtx(opts: {
  activeCandidates?: MetaFileCandidate[];
  indexFs?: LifecycleIndexFs;
} = {}): {
  ctx: ExecuteTransitionContext;
  calls: string[];
  worktreeOps: unknown[];
} {
  const calls: string[] = [];
  const worktreeOps: unknown[] = [];

  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user", "user-workspace"] satisfies SideEffectId[]) {
    sideEffects[id] = () => {
      calls.push(`side:${id}`);
      return undefined;
    };
  }

  const ctx: ExecuteTransitionContext = {
    cwd: CWD,
    indexFs: opts.indexFs ?? emptyIndexFs(),
    setPhase: async () => ({ phase: "Active" }),
    relocateArtifacts: async () => ({ moved: [] }),
    reconcileBranch: async () => {},
    reconcileWorkUnitWorktree: async (op) => {
      worktreeOps.push(op);
      calls.push(op.mutation === "spawn" && op.inPlace ? "worktree:spawn:in-place" : `worktree:${op.mutation}`);
      if (op.mutation === "spawn") {
        return { mutation: "spawn", worktreePath: WORKTREE, branch: op.branch };
      }
      if (op.mutation === "teardown") {
        return { mutation: "teardown", worktreePath: op.worktreePath, locusHopped: false };
      }
      return { mutation: "move", from: op.from, to: op.to, locusHopped: false };
    },
    writeBranchField: async () => {},
    writeCurrentWorkflowField: async () => {},
    writeDesignField: async () => {},
    writeSoftFields: async () => {},
    sideEffects,
    guardValidators: {
      "worktree-occupancy": opts.activeCandidates === undefined
        ? () => ({ ok: true })
        : makeWorktreeOccupancyGuard({
            cwd: CWD,
            readActiveMetaCandidates: async () => ({
              layout: "full",
              candidates: opts.activeCandidates ?? [],
              warnings: [],
            }),
          }),
    },
  };

  return { ctx, calls, worktreeOps };
}

describe("runMaterialize", () => {
  it("materializes a remote work unit when the local base carries its planned backlog record", async () => {
    let lifecycleReads = 0;
    const plannedIndexFs: LifecycleIndexFs = {
      readdir: async (path) => {
        lifecycleReads += 1;
        if (path.endsWith("/.arc/backlog/planned")) {
          return [{ name: "meta-foo.md", isDirectory: () => false, isFile: () => true }];
        }
        throw new Error(`ENOENT: ${path}`);
      },
      readFile: async (path) => {
        lifecycleReads += 1;
        if (path.endsWith("/.arc/backlog/planned/meta-foo.md")) {
          return "# Metadata: foo\n\n- **State:** Planning\n";
        }
        throw new Error(`ENOENT: ${path}`);
      },
    };
    const { ctx } = buildCtx({ indexFs: plannedIndexFs });

    const result = await runMaterialize(ctx, {
      name: "foo",
      branch: "feat/foo",
      locationTemplate: "../{repo}-{branch}",
      repo: "arc-framework",
      spawningIdentity: "andrew",
    });

    expect(result.status).toBe("materialized");
    if (result.status !== "materialized") return;
    expect(result.worktreePath).toBe(WORKTREE);
    expect(lifecycleReads).toBe(0);
  });

  it("checks out the fetched remote branch in place when requested", async () => {
    const { ctx, calls, worktreeOps } = buildCtx();

    const result = await runMaterialize(ctx, {
      name: "foo",
      branch: "feat/foo",
      inPlace: true,
    });

    expect(result.status).toBe("materialized");
    if (result.status !== "materialized") return;
    expect(result.branch).toBe("feat/foo");
    expect(result.inPlace).toBe(true);
    expect(calls).toContain("worktree:spawn:in-place");
    expect(worktreeOps[0]).toEqual({
      mutation: "spawn",
      inPlace: true,
      branch: "feat/foo",
      wuName: "foo",
      createBranch: false,
    });
  });

  it("refuses an in-place materialize when another WU occupies the current checkout", async () => {
    const { ctx, calls, worktreeOps } = buildCtx({ activeCandidates: [candidate({})] });

    const result = await runMaterialize(ctx, {
      name: "foo",
      branch: "feat/foo",
      inPlace: true,
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/already holds an active work unit `other`/i);
    expect(calls).not.toContain("worktree:spawn:in-place");
    expect(worktreeOps).toEqual([]);
  });

  it("returns a rejection when the occupancy guard throws", async () => {
    const { ctx, worktreeOps } = buildCtx();
    const result = await runMaterialize({
      ...ctx,
      guardValidators: {
        "worktree-occupancy": async () => {
          throw new Error("occupancy probe failed");
        },
      },
    }, {
      name: "foo",
      branch: "feat/foo",
      inPlace: true,
    });

    expect(result).toEqual({ status: "rejected", reason: "occupancy probe failed" });
    expect(worktreeOps).toEqual([]);
  });

  it("spawns from the remote branch without enforcing current-checkout occupancy", async () => {
    const { ctx, calls, worktreeOps } = buildCtx({ activeCandidates: [candidate({})] });

    const result = await runMaterialize(ctx, {
      name: "foo",
      branch: "feat/foo",
      locationTemplate: "../{repo}-{branch}",
      repo: "arc-framework",
      spawningIdentity: "andrew",
    });

    expect(result.status).toBe("materialized");
    if (result.status !== "materialized") return;
    expect(result.inPlace).toBe(false);
    expect(calls).toContain("worktree:spawn");
    expect(calls.some((call) => call.startsWith("side:"))).toBe(false);
    expect(worktreeOps[0]).toMatchObject({
      mutation: "spawn",
      branch: "feat/foo",
      createBranch: true,
      base: "origin/feat/foo",
    });
  });
});
