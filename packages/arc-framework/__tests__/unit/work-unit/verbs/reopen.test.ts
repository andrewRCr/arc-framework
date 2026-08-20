/**
 * Unit tests for the `reopen` verb — the inverse of `integrate`.
 *
 * `reopen` withdraws an `Integrating` WU back to `Active` for more work: a
 * `set-phase`-only move (no location move, no branch rotation) that fires the
 * `withdraw-pr` side-effect to close (or convert-to-draft per inputs) the open
 * PR. The `pr-unmerged` guard rejects a WU whose PR has already merged — that is
 * a new origin-linked follow-up, never a reopen. The mutators and side-effects
 * reach the contract as spies, so each behavior is asserted over an in-memory
 * index.
 */

import { describe, it, expect } from "vitest";

import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import { runReopen, type ReopenParams } from "../../../../src/lib/work-unit/verbs/reopen.js";

const CWD = "/repo";

interface MetaSpec {
  slug: string;
  state: string;
  branch?: string;
  currentWorkflow?: string;
}

/** Build an injectable index fs over a fixed set of `active/` metas. */
function buildIndexFs(metas: MetaSpec[]): LifecycleIndexFs {
  const activeDir = `${CWD}/.arc/active`;
  const entries: DirEntry[] = [];
  const files = new Map<string, string>();

  for (const meta of metas) {
    const filename = `meta-${meta.slug}.md`;
    entries.push({ name: filename, isDirectory: () => false });
    files.set(
      `${activeDir}/${filename}`,
      `# Metadata: ${meta.slug}\n\n` +
        `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
        `|-----------|-----------|------------|-----------|--------------|\n` +
        `| \`${meta.state}\` | \`andrew\` | \`${meta.branch ?? "feat/foo"}\` | \`Novel\` | \`P1\` |\n\n` +
        `- **Current Workflow:** ${meta.currentWorkflow ?? "[none]"}\n` +
        `- **Last Completed:** [none]\n- **Next Task:** [none]\n- **Blockers:** [none]\n\n` +
        `- **Next Action:** continue.\n\n---\n`,
    );
  }

  return {
    readdir: (path) =>
      path === activeDir ? Promise.resolve(entries) : Promise.reject(new Error(`ENOENT: ${path}`)),
    readFile: (path) => {
      const content = files.get(path);
      return content === undefined ? Promise.reject(new Error(`ENOENT: ${path}`)) : Promise.resolve(content);
    },
  };
}

interface Harness {
  ctx: ExecuteTransitionContext;
  calls: string[];
  currentWorkflowWrites: string[];
  withdrawInputs: ("close" | "draft" | undefined)[];
  softWrites: Record<string, string>[];
}

function buildCtx(metas: MetaSpec[]): Harness {
  const calls: string[] = [];
  const currentWorkflowWrites: string[] = [];
  const withdrawInputs: Harness["withdrawInputs"] = [];
  const softWrites: Record<string, string>[] = [];

  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user"] satisfies SideEffectId[]) {
    sideEffects[id] = () => {
      calls.push(`side:${id}`);
      return undefined;
    };
  }
  sideEffects["withdraw-pr"] = (sideCtx) => {
    calls.push("side:withdraw-pr");
    withdrawInputs.push(sideCtx.inputs.prWithdrawMode);
    return undefined;
  };

  const ctx: ExecuteTransitionContext = {
    cwd: CWD,
    indexFs: buildIndexFs(metas),
    setPhase: async (params) => {
      calls.push(`setPhase:${params.phase}`);
      return { phase: "Active" };
    },
    relocateArtifacts: async (params) => {
      calls.push(`relocate:${params.fromDir}->${params.toDir}`);
      return { moved: [] };
    },
    reconcileBranch: async (op) => {
      calls.push(`branch:${op.mutation}`);
    },
    reconcileWorkUnitWorktree: async () => {
      calls.push("worktree:spawn");
      return { mutation: "spawn", worktreePath: "/wt", branch: "x" };
    },
    writeBranchField: async () => {
      calls.push("write:branch");
    },
    writeCurrentWorkflowField: async (_path, workflow) => {
      calls.push("write:current-workflow");
      currentWorkflowWrites.push(workflow);
    },
    writeDesignField: async () => {
      calls.push("write:design");
    },
    writeSoftFields: async (_path, updates) => {
      calls.push("write:soft-fields");
      softWrites.push(updates as Record<string, string>);
    },
    stageMeta: async () => {
      calls.push("stage:meta");
    },
    sideEffects,
  };

  return { ctx, calls, currentWorkflowWrites, withdrawInputs, softWrites };
}

const INTEGRATING: MetaSpec = { slug: "foo", state: "Integrating", branch: "feat/foo" };

// A verified-unmerged PR — the only state that clears the `pr-unmerged` guard.
const BASE: ReopenParams = { name: "foo", prMerged: false };

describe("runReopen — the set-phase-only move", () => {
  it("flips Integrating back to Active with no location move and no branch rotation", async () => {
    const { ctx, calls, currentWorkflowWrites } = buildCtx([INTEGRATING]);

    const result = await runReopen(ctx, BASE);

    expect(result.status).toBe("reopened");
    if (result.status !== "reopened") return;
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("reopen");
      expect(result.outcome.from).toEqual({ phase: "Integrating", location: "active" });
      expect(result.outcome.to).toEqual({ phase: "Active", location: "active" });
    }
    expect(result.metaPath).toBe(".arc/active/meta-foo.md");
    expect(calls).toContain("setPhase:Active");
    expect(currentWorkflowWrites).toEqual(["prepare-work-unit"]);
    // No location move and no branch rotation — the working branch already carries its prefix.
    expect(calls.some((c) => c.startsWith("relocate:") || c.startsWith("branch:"))).toBe(false);
  });

  it("finishes the exact partial Active projection and idempotently replays withdrawal", async () => {
    const { ctx, calls, currentWorkflowWrites, withdrawInputs, softWrites } = buildCtx([{
      slug: "foo",
      state: "Active",
      branch: "feat/foo",
      currentWorkflow: "integrate-work-unit",
    }]);

    await expect(runReopen(ctx, BASE)).resolves.toMatchObject({ status: "reopened" });
    expect(currentWorkflowWrites).toEqual(["prepare-work-unit"]);
    expect(softWrites).toEqual([{ "Next Action": "[none]" }]);
    expect(calls).toContain("stage:meta");
    expect(calls).toContain("side:reconcile-roadmap");
    expect(calls).not.toContain("setPhase:Active");
    expect(calls).toContain("side:withdraw-pr");
    expect(calls).toContain("side:reconcile-status-user");
    expect(withdrawInputs).toEqual(["close"]);
  });

  it.each(["soft-fields", "stage-meta"] as const)(
    "repairs a %s finalization failure after withdrawal changed the phase",
    async (failure) => {
      const first = buildCtx([INTEGRATING]);
      if (failure === "soft-fields") {
        first.ctx.writeSoftFields = async () => {
          throw new Error("soft-field write failed");
        };
      } else {
        first.ctx.stageMeta = async () => {
          throw new Error("meta staging failed");
        };
      }
      await expect(runReopen(first.ctx, BASE)).resolves.toMatchObject({ status: "rejected" });

      const retry = buildCtx([{
        slug: "foo",
        state: "Active",
        branch: "feat/foo",
        currentWorkflow: "integrate-work-unit",
      }]);
      await expect(runReopen(retry.ctx, BASE)).resolves.toMatchObject({ status: "reopened" });
      expect(retry.currentWorkflowWrites).toEqual(["prepare-work-unit"]);
      expect(retry.softWrites).toEqual([{ "Next Action": "[none]" }]);
      expect(retry.calls).toContain("stage:meta");
      expect(retry.calls).toContain("side:withdraw-pr");
    },
  );

  it("does not treat an ordinary Active work unit as an interrupted reopen", async () => {
    const { ctx, calls } = buildCtx([{
      slug: "foo",
      state: "Active",
      branch: "feat/foo",
      currentWorkflow: "prepare-work-unit",
    }]);

    await expect(runReopen(ctx, BASE)).resolves.toMatchObject({ status: "rejected" });
    expect(calls).toEqual([]);
  });

  it.each([
    [true, /merged/iu],
    [undefined, /can't be confirmed|unverifiable|unavailable/iu],
  ] as const)("reapplies the PR guard before recovering a partial Active projection", async (prMerged, reason) => {
    const { ctx, calls } = buildCtx([{
      slug: "foo",
      state: "Active",
      branch: "feat/foo",
      currentWorkflow: "integrate-work-unit",
    }]);

    const result = await runReopen(ctx, { name: "foo", prMerged });

    expect(result).toMatchObject({ status: "rejected" });
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(reason);
    expect(calls).toEqual([]);
  });
});

describe("runReopen — soft-field disposition", () => {
  it("clears the now-stale integration Next Action pointer on withdrawal", async () => {
    const { ctx, softWrites } = buildCtx([INTEGRATING]);

    await runReopen(ctx, BASE);

    // Withdrawing from review back to Active: the integration `Next Action` is
    // cleared (no longer "open the PR"); `Next Task` stays untouched.
    expect(softWrites).toHaveLength(1);
    expect(softWrites[0]).toEqual({ "Next Action": "[none]" });
  });
});

describe("runReopen — PR withdrawal", () => {
  it("fires withdraw-pr in close mode by default", async () => {
    const { ctx, calls, withdrawInputs } = buildCtx([INTEGRATING]);

    await runReopen(ctx, BASE);

    expect(calls).toContain("side:withdraw-pr");
    expect(withdrawInputs).toEqual(["close"]);
  });

  it("passes the draft mode through to withdraw-pr per inputs", async () => {
    const { ctx, withdrawInputs } = buildCtx([INTEGRATING]);

    await runReopen(ctx, { ...BASE, withdrawMode: "draft" });

    expect(withdrawInputs).toEqual(["draft"]);
  });
});

describe("runReopen — the pr-unmerged guard", () => {
  it("rejects reopening a WU whose PR has already merged", async () => {
    const { ctx, calls } = buildCtx([INTEGRATING]);

    const result = await runReopen(ctx, { ...BASE, prMerged: true });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/merg/i);
    // Guard fires before any mutation or PR withdrawal.
    expect(calls.some((c) => c.startsWith("setPhase:") || c === "side:withdraw-pr")).toBe(false);
  });

  it("refuses when the merge state can't be confirmed (the safe default)", async () => {
    const { ctx, calls } = buildCtx([INTEGRATING]);

    // `gh`/remote unavailable → caller forwards an undefined merge fact. The guard
    // refuses rather than reopen on an unverifiable PR.
    const result = await runReopen(ctx, { ...BASE, prMerged: undefined });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/can't be confirmed|unverifiable|unavailable/i);
    // No mutation or PR withdrawal on an unconfirmable merge state.
    expect(calls.some((c) => c.startsWith("setPhase:") || c === "side:withdraw-pr")).toBe(false);
  });

  it("rejects an invalid work-unit name without mutation or PR withdrawal", async () => {
    const { ctx, calls, softWrites } = buildCtx([INTEGRATING]);

    const result = await runReopen(ctx, { ...BASE, name: "../foo" });

    expect(result.status).toBe("rejected");
    expect(calls).toEqual([]);
    expect(softWrites).toEqual([]);
  });
});
