/**
 * Unit tests for the `deactivate` verb — the narrow inverse of `activate`.
 *
 * `deactivate` undoes a premature activation: a recoverable phase↓
 * (`Active → Planning`) with the branch rotated back `<type>/ → plan/`, no
 * location move. It is narrow by design — shelving in-progress work is
 * `park@Active`, destructive teardown is `abandon`, and there is no merged
 * corner (post-merge rework is a new origin-linked WU). The mutators and
 * side-effects reach the contract as spies, so each behavior is asserted over an
 * in-memory index.
 */

import { describe, it, expect } from "vitest";

import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import { runDeactivate, type DeactivateParams } from "../../../../src/lib/work-unit/verbs/deactivate.js";

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
        `- **Last Completed:** [none]\n- **Next Task:** Task 1.1 — do.\n- **Blockers:** [none]\n\n` +
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
  softFields: string[];
}

function buildCtx(metas: MetaSpec[]): Harness {
  const calls: string[] = [];
  const softFields: string[] = [];

  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user"] satisfies SideEffectId[]) {
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
      return { phase: "Planning" };
    },
    relocateArtifacts: async (params) => {
      calls.push(`relocate:${params.fromDir}->${params.toDir}`);
      return { moved: [] };
    },
    reconcileBranch: async (op) => {
      calls.push(op.mutation === "rename" ? `branch:rename:${op.branch}->${op.toBranch}` : `branch:${op.mutation}`);
    },
    reconcileWorktree: async () => ({ mutation: "spawn", worktreePath: "/wt", branch: "x" }),
    writeSoftFields: async (path, updates) => {
      softFields.push(...Object.keys(updates));
    },
    sideEffects,
  };

  return { ctx, calls, softFields };
}

const ACTIVE: MetaSpec = { slug: "foo", state: "Active", branch: "feat/foo" };
const PLANNING: MetaSpec = { slug: "foo", state: "Planning", branch: "plan/foo" };

const BASE: DeactivateParams = { name: "foo" };

describe("runDeactivate — the narrow undo", () => {
  it("rotates the branch back to plan/ and drops the phase to Planning, no location move", async () => {
    const { ctx, calls, softFields } = buildCtx([ACTIVE]);

    const result = await runDeactivate(ctx, BASE);

    expect(result.status).toBe("deactivated");
    if (result.status !== "deactivated") return;
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("deactivate");
      expect(result.outcome.from).toEqual({ phase: "Active", location: "active" });
      expect(result.outcome.to).toEqual({ phase: "Planning", location: "active" });
    }
    // The meta stays in active/ — no location move.
    expect(result.metaPath).toBe(".arc/active/meta-foo.md");
    expect(calls).toContain("branch:rename:feat/foo->plan/foo");
    expect(calls).toContain("setPhase:Planning");
    expect(calls.some((c) => c.startsWith("relocate:"))).toBe(false);
    // The just-activated Next Task is cleared (the activation is undone).
    expect(softFields).toContain("Next Task");
  });
});

describe("runDeactivate — illegal sources", () => {
  it("rejects deactivating a WU that is not Active (only an active WU qualifies)", async () => {
    const { ctx, calls } = buildCtx([PLANNING]);

    const result = await runDeactivate(ctx, BASE);

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/deactivate|active/i);
    expect(calls.some((c) => c.startsWith("setPhase:") || c.startsWith("branch:"))).toBe(false);
  });
});
