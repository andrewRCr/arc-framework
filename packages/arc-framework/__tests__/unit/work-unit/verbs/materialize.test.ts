/**
 * Unit tests for cross-machine WU materialize.
 *
 * Materialize starts from a local `nonexistent` source: the authoritative meta
 * already rides the fetched remote branch, so the verb supplies only the
 * worktree placement operands to the lifecycle executor.
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

function buildCtx(opts: { activeCandidates?: MetaFileCandidate[] } = {}): {
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
    indexFs: emptyIndexFs(),
    setPhase: async () => ({ phase: "Active" }),
    relocateArtifacts: async () => ({ moved: [] }),
    reconcileBranch: async () => {},
    reconcileWorktree: async (op) => {
      worktreeOps.push(op);
      calls.push(op.mutation === "spawn" && op.inPlace ? "worktree:spawn:in-place" : `worktree:${op.mutation}`);
      return op.mutation === "spawn"
        ? { mutation: "spawn", worktreePath: WORKTREE, branch: op.branch }
        : { mutation: "teardown", worktreePath: op.worktreePath, locusHopped: false };
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
    expect(worktreeOps[0]).toMatchObject({
      mutation: "spawn",
      branch: "feat/foo",
      createBranch: true,
      base: "origin/feat/foo",
    });
  });
});
