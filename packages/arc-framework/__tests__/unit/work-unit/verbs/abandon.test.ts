/**
 * Unit tests for the `abandon` verb — the destructive inverse of `stub`.
 *
 * `abandon` removes a WU from any **pre-merge** state, leaving no residue (the
 * resolver then returns `nonexistent`). It is a destructive cascade gated on an
 * explicit confirmation (`--yes`); bare invocation refuses (safe default). The
 * cascade is phase-polymorphic: a backlog stub is just an artifact removal; a
 * started WU (`planning` / `active`) also tears down its branch and worktree; a
 * `parked` WU deletes its preserved branch but has no worktree to tear down.
 * `integrating` and merged / `shipped` are illegal — post-merge backout is a new
 * origin-linked WU. The mutators, the remove runner, and the side-effects reach
 * the contract as spies, so each behavior is asserted over an in-memory index.
 */

import { describe, it, expect } from "vitest";

import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import { planAbandon, runAbandon, type AbandonContext, type AbandonParams } from "../../../../src/lib/work-unit/verbs/abandon.js";

const CWD = "/repo";
const WORKTREE = "/repo/../wt-foo";

interface MetaSpec {
  slug: string;
  /** Lifecycle tier directory under `.arc/` (e.g. `active`, `backlog/provisional`). */
  tier: string;
  /** Per-WU subdir under the tier; empty for the flat `active/` layout. */
  subdir: string;
  state: string;
  branch?: string;
}

/** Build an injectable index fs over a fixed set of metas. */
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
        `| \`${meta.state}\` | \`andrew\` | \`${meta.branch ?? "[none]"}\` | \`Novel\` | \`P1\` |\n\n` +
        `- **Last Completed:** [none]\n- **Next Task:** [none]\n- **Blockers:** [none]\n\n` +
        `- **Next Action:** continue.\n\n---\n`,
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
  ctx: AbandonContext;
  calls: string[];
  removed: string[];
  rmdirs: string[];
}

function buildCtx(metas: MetaSpec[]): Harness {
  const calls: string[] = [];
  const removed: string[] = [];
  const rmdirs: string[] = [];

  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user", "user-workspace"] satisfies SideEffectId[]) {
    sideEffects[id] = () => {
      calls.push(`side:${id}`);
      return undefined;
    };
  }

  const executor: Omit<ExecuteTransitionContext, "scaffoldOrRemove"> = {
    cwd: CWD,
    indexFs: buildIndexFs(metas),
    setPhase: async () => ({ phase: "Planning" }),
    relocateArtifacts: async () => ({ moved: [] }),
    reconcileBranch: async (op) => {
      calls.push(op.mutation === "delete" ? `branch:delete:${op.branch}` : `branch:${op.mutation}`);
    },
    reconcileWorktree: async (op) => {
      calls.push(op.mutation === "teardown" ? `worktree:teardown:${op.currentLocus}` : `worktree:${op.mutation}`);
      return op.mutation === "teardown"
        ? { mutation: "teardown", worktreePath: op.worktreePath, locusHopped: true }
        : { mutation: "spawn", worktreePath: WORKTREE, branch: "x" };
    },
    writeSoftFields: async () => {},
    sideEffects,
  };

  // The artifact-removal seam: list the WU's files, delete each, drop the emptied subdir.
  const fs: AbandonContext["fs"] = {
    readdir: async (path) => {
      // One meta per WU in these fixtures; the matcher narrows by slug.
      return path.includes("/.arc/") ? ["meta-foo.md", "spec-foo.md", "cohort-other.md"] : [];
    },
    rm: async (path) => {
      removed.push(String(path));
    },
    rmdir: async (path) => {
      rmdirs.push(String(path));
    },
  };

  return { ctx: { executor, fs }, calls, removed, rmdirs };
}

const BASE: AbandonParams = { name: "foo", confirmed: true, worktreePath: WORKTREE, currentLocus: WORKTREE };

const ACTIVE: MetaSpec = { slug: "foo", tier: "active", subdir: "", state: "Active", branch: "feat/foo" };
const PROVISIONAL: MetaSpec = { slug: "foo", tier: "backlog/provisional", subdir: "foo", state: "Planning" };
const PARKED: MetaSpec = { slug: "foo", tier: "backlog/planned", subdir: "foo", state: "Active", branch: "feat/foo" };
const INTEGRATING: MetaSpec = { slug: "foo", tier: "active", subdir: "", state: "Integrating", branch: "feat/foo" };

describe("runAbandon — the confirmation gate", () => {
  it("refuses without an explicit --yes, removing nothing", async () => {
    const { ctx, calls, removed } = buildCtx([ACTIVE]);

    const result = await runAbandon(ctx, { ...BASE, confirmed: undefined });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/confirm|--yes|refus/i);
    expect(removed).toEqual([]);
    expect(calls.some((c) => c.startsWith("branch:") || c.startsWith("worktree:"))).toBe(false);
  });
});

describe("runAbandon — started WU (active)", () => {
  it("removes the artifact set, deletes the branch, and tears down the worktree with the current locus", async () => {
    const { ctx, calls, removed } = buildCtx([ACTIVE]);

    const result = await runAbandon(ctx, BASE);

    expect(result.status).toBe("abandoned");
    if (result.status !== "abandoned") return;
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("abandon");
      expect(result.outcome.to).toBeNull(); // resolves to nonexistent
    }
    // Only the WU's own artifacts are removed — a foreign cohort-*.md is left.
    expect(removed).toContain("/repo/.arc/active/meta-foo.md");
    expect(removed).toContain("/repo/.arc/active/spec-foo.md");
    expect(removed.some((p) => p.includes("cohort-other"))).toBe(false);
    expect(calls).toContain("branch:delete:feat/foo");
    // Execution-locus relocation: the teardown op carries the current locus for self-teardown detection.
    expect(calls).toContain(`worktree:teardown:${WORKTREE}`);
    // The user-workspace satellite is closed and the readiness views regen.
    expect(calls).toContain("side:user-workspace");
    expect(calls).toContain("side:reconcile-roadmap");
  });
});

describe("runAbandon — backlog stub (provisional)", () => {
  it("removes the artifacts and drops the emptied subdir, with no branch or worktree teardown", async () => {
    const { ctx, calls, removed, rmdirs } = buildCtx([PROVISIONAL]);

    const result = await runAbandon(ctx, { name: "foo", confirmed: true });

    expect(result.status).toBe("abandoned");
    if (result.status !== "abandoned") return;
    expect(removed).toContain("/repo/.arc/backlog/provisional/foo/meta-foo.md");
    // Per-WU backlog subdir is removed once emptied.
    expect(rmdirs).toContain("/repo/.arc/backlog/provisional/foo");
    expect(calls.some((c) => c.startsWith("branch:") || c.startsWith("worktree:"))).toBe(false);
  });
});

describe("runAbandon — parked WU", () => {
  it("deletes the preserved branch but tears down no worktree (parked has none)", async () => {
    const { ctx, calls } = buildCtx([PARKED]);

    const result = await runAbandon(ctx, { name: "foo", confirmed: true });

    expect(result.status).toBe("abandoned");
    if (result.status !== "abandoned") return;
    expect(calls).toContain("branch:delete:feat/foo");
    expect(calls.some((c) => c.startsWith("worktree:"))).toBe(false);
  });
});

describe("planAbandon — the impact plan per from-state", () => {
  it("a started WU (active) plans branch + worktree teardown alongside artifacts", () => {
    const plan = planAbandon("active", "feat/foo");
    expect(plan.legal).toBe(true);
    expect(plan.lines.some((l) => /Branch:.*feat\/foo.*local \+ remote/.test(l))).toBe(true);
    expect(plan.lines.some((l) => /Worktree:/.test(l))).toBe(true);
    expect(plan.lines.some((l) => /Artifacts:/.test(l))).toBe(true);
  });

  it("a backlog stub (provisional) plans only the artifact removal — no branch or worktree", () => {
    const plan = planAbandon("provisional", null);
    expect(plan.legal).toBe(true);
    expect(plan.lines.some((l) => /Artifacts:/.test(l))).toBe(true);
    expect(plan.lines.some((l) => /Branch:|Worktree:/.test(l))).toBe(false);
  });

  it("a parked WU plans branch teardown but no worktree (parked has none)", () => {
    const plan = planAbandon("parked", "feat/foo");
    expect(plan.legal).toBe(true);
    expect(plan.lines.some((l) => /Branch:/.test(l))).toBe(true);
    expect(plan.lines.some((l) => /Worktree:/.test(l))).toBe(false);
  });

  it("an illegal source (integrating) yields no plan", () => {
    const plan = planAbandon("integrating", "feat/foo");
    expect(plan.legal).toBe(false);
    expect(plan.lines).toEqual([]);
  });

  it("a merged / shipped WU yields no plan", () => {
    expect(planAbandon("shipped", null).legal).toBe(false);
  });
});

describe("runAbandon — illegal sources", () => {
  it("rejects abandoning an Integrating WU (route via reopen first)", async () => {
    const { ctx, removed } = buildCtx([INTEGRATING]);

    const result = await runAbandon(ctx, BASE);

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/reopen|integrat/i);
    expect(removed).toEqual([]);
  });
});
