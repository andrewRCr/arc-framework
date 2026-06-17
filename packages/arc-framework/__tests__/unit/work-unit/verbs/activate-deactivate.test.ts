/**
 * Unit tests for the `activate` / `deactivate` phase-axis inverse pair.
 *
 * Both rotate a WU between `Planning` and `Active` in place (no location move):
 * `activate` raises a graduated planning WU (branch `plan/ → <type>/`, phase
 * `Active`, orientation set, satisfied dep-edges discharged); `deactivate` undoes a
 * premature activation (branch `<type>/ → plan/`, phase `Planning`, `Next Task`
 * cleared). The mutators and side-effects reach each verb as spies, so every
 * behavior is asserted over an in-memory index.
 */

import { describe, it, expect } from "vitest";

import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import {
  runActivate,
  runDeactivate,
  type ActivateParams,
  type DeactivateParams,
} from "../../../../src/lib/work-unit/verbs/activate-deactivate.js";

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

  // Register every side-effect the activate / deactivate edges declare; only the
  // edge's own declared set fires per transition.
  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of [
    "reconcile-roadmap",
    "reconcile-status-user",
    "discharge-dep-edges",
    "user-workspace",
  ] satisfies SideEffectId[]) {
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
      // The result is unused by the executor; return a valid sentinel phase.
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
    writeBranchField: async () => {},
    writeSoftFields: async (path, updates) => {
      softFields.push(...Object.keys(updates));
    },
    sideEffects,
  };

  return { ctx, calls, softFields };
}

const ACTIVE: MetaSpec = { slug: "foo", state: "Active", branch: "feat/foo" };
const PLANNING: MetaSpec = { slug: "foo", state: "Planning", branch: "plan/foo" };

describe("runActivate — raise a planning WU to Active", () => {
  const params: ActivateParams = {
    name: "foo",
    toBranch: "feat/foo",
    nextTask: "Task 1.1 — first task.",
    nextAction: "Begin Task 1.1.",
  };

  it("rotates plan/ onto the working branch, sets Active, and writes the orientation inputs", async () => {
    const { ctx, calls, softFields } = buildCtx([PLANNING]);

    const result = await runActivate(ctx, params);

    expect(result.status).toBe("activated");
    if (result.status !== "activated") return;
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("activate");
      expect(result.outcome.from).toEqual({ phase: "Planning", location: "active" });
      expect(result.outcome.to).toEqual({ phase: "Active", location: "active" });
    }
    // The meta stays in active/ — no location move.
    expect(result.metaPath).toBe(".arc/active/meta-foo.md");
    expect(calls).toContain("branch:rename:plan/foo->feat/foo");
    expect(calls).toContain("setPhase:Active");
    expect(calls.some((c) => c.startsWith("relocate:"))).toBe(false);
    // The orientation soft fields are written from caller inputs (never fabricated).
    expect(softFields).toContain("Next Task");
    expect(softFields).toContain("Next Action");
  });

  it("fires the discharge-dep-edges side-effect (the dep-edge write half)", async () => {
    const { ctx, calls } = buildCtx([PLANNING]);

    await runActivate(ctx, params);

    expect(calls).toContain("side:discharge-dep-edges");
  });

  it("rejects activating a WU that is not a planning WU on its branch", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runActivate(ctx, params);

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/activate|planning/i);
    expect(calls.some((c) => c.startsWith("setPhase:") || c.startsWith("branch:"))).toBe(false);
  });
});

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
    // The just-activated Next Task and the stale Active-phase Next Action are both
    // cleared (the activation is undone — neither pointer survives the drop to Planning).
    expect(softFields).toContain("Next Task");
    expect(softFields).toContain("Next Action");
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
