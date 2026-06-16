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
  withdrawInputs: ("close" | "draft" | undefined)[];
}

function buildCtx(metas: MetaSpec[]): Harness {
  const calls: string[] = [];
  const withdrawInputs: Harness["withdrawInputs"] = [];

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
    reconcileWorktree: async () => ({ mutation: "spawn", worktreePath: "/wt", branch: "x" }),
    writeBranchField: async () => {},
    writeSoftFields: async () => {},
    sideEffects,
  };

  return { ctx, calls, withdrawInputs };
}

const INTEGRATING: MetaSpec = { slug: "foo", state: "Integrating", branch: "feat/foo" };

const BASE: ReopenParams = { name: "foo" };

describe("runReopen — the set-phase-only move", () => {
  it("flips Integrating back to Active with no location move and no branch rotation", async () => {
    const { ctx, calls } = buildCtx([INTEGRATING]);

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
    // No location move and no branch rotation — the working branch already carries its prefix.
    expect(calls.some((c) => c.startsWith("relocate:") || c.startsWith("branch:"))).toBe(false);
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
});
