/**
 * Unit tests for the `integrate` verb — the forward phase move opening review.
 *
 * `integrate` flips an `Active` WU to `Integrating`: a `set-phase`-only move (no
 * location move, no branch rotation — the working branch already carries its
 * `<type>/` prefix from `activate`) that marks phase entry, not the merge (the
 * integration-interlock owns merge approval). The verb forwards the two judgment
 * soft-field inputs (`Last Completed` / `Next Action`) and dispatches through the
 * executor; a non-`Active` source falls to the table's illegal-edge rejection. The
 * mutators and side-effects reach the contract as spies, so each behavior is
 * asserted over an in-memory index.
 */

import { describe, it, expect } from "vitest";

import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import { runIntegrate, type IntegrateParams } from "../../../../src/lib/work-unit/verbs/integrate.js";

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
        `- **Last Completed:** [none]\n- **Next Task:** continue.\n- **Blockers:** [none]\n\n` +
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
  softWrites: Record<string, string>[];
}

function buildCtx(metas: MetaSpec[]): Harness {
  const calls: string[] = [];
  const softWrites: Record<string, string>[] = [];

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
    setPhase: async (params) => {
      calls.push(`setPhase:${params.phase}`);
      return { phase: "Integrating" };
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
    writeCurrentWorkflowField: async () => {},
    writeDesignField: async () => {},
    writeSoftFields: async (_path, updates) => {
      softWrites.push(updates as Record<string, string>);
    },
    sideEffects,
  };

  return { ctx, calls, softWrites };
}

const ACTIVE: MetaSpec = { slug: "foo", state: "Active", branch: "feat/foo" };

const BASE: IntegrateParams = { name: "foo", lastCompleted: "Phase 7 — verification", nextAction: "open the PR" };

describe("runIntegrate — the set-phase-only move", () => {
  it("flips Active to Integrating with no location move and no branch rotation", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runIntegrate(ctx, BASE);

    expect(result.status).toBe("integrated");
    if (result.status !== "integrated") return;
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("integrate");
      expect(result.outcome.from).toEqual({ phase: "Active", location: "active" });
      expect(result.outcome.to).toEqual({ phase: "Integrating", location: "active" });
    }
    expect(result.metaPath).toBe(".arc/active/meta-foo.md");
    expect(calls).toContain("setPhase:Integrating");
    // No location move and no branch rotation — the working branch already carries its prefix.
    expect(calls.some((c) => c.startsWith("relocate:") || c.startsWith("branch:"))).toBe(false);
  });

  it("writes the supplied Last Completed and Next Action, clearing Next Task", async () => {
    const { ctx, softWrites } = buildCtx([ACTIVE]);

    await runIntegrate(ctx, BASE);

    // Phase entry sets the integration orientation from caller inputs; `Next Task`
    // resets to `[none]` (the active task list is closed), `Blockers` is left.
    expect(softWrites).toHaveLength(1);
    expect(softWrites[0]).toEqual({
      "Last Completed": "Phase 7 — verification",
      "Next Task": "[none]",
      "Next Action": "open the PR",
    });
  });
});

describe("runIntegrate — the illegal-edge lookup", () => {
  it("rejects integrating a WU that is not Active", async () => {
    const { ctx, calls } = buildCtx([{ slug: "foo", state: "Integrating", branch: "feat/foo" }]);

    const result = await runIntegrate(ctx, BASE);

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    // Rejected at lookup before any mutation.
    expect(calls.some((c) => c.startsWith("setPhase:"))).toBe(false);
  });
});
