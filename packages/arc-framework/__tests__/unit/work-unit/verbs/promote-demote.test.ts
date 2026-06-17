/**
 * Unit tests for the `promote` / `demote` backlog-tier inverse pair.
 *
 * Both are content-preserving relocations between the two backlog tiers
 * (`provisional` ↔ `planned`). `promote` carries the Class ratchet — it refuses
 * to raise a stub whose `Class` is still `[TBD]`, reading the realized value
 * from the source meta to feed the guard. `demote` is the unguarded inverse: it
 * lowers a planned stub back to provisional and never re-blanks the realized
 * Class (the ratchet is sticky). Both are cohort-aware: a nested stub
 * (`backlog/{tier}/{cohort}/{name}/`) relocates within its cohort segment, the
 * destination cohort dir is created, and the emptied source dirs are pruned up
 * to (never including) the tier root.
 *
 * The relocate mutator and side-effects reach the executor as spies, so each
 * behavior is asserted over an in-memory index; the prune filesystem is a second
 * spy modelling post-move directory emptiness independently of the (spied) move.
 */

import { describe, it, expect } from "vitest";

import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import {
  runPromote,
  runDemote,
  type BacklogMoveContext,
  type BacklogMoveFs,
} from "../../../../src/lib/work-unit/verbs/promote-demote.js";

const CWD = "/repo";

interface MetaSpec {
  slug: string;
  /** Lifecycle tier directory under `.arc/` (e.g. `backlog/provisional`). */
  tier: string;
  /** Per-WU subdir under the tier — `{name}` (flat) or `{cohort}/{name}` (nested). */
  subdir: string;
  state: string;
  /** The meta's recorded `Class`; defaults to `Novel` (a realized value). */
  cls?: string;
}

/** Build an injectable index fs over a fixed set of backlog metas. */
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
    const dirAbs = `${tierAbs}/${meta.subdir}`;
    let parent = tierAbs;
    for (const seg of meta.subdir.split("/")) {
      addChildDir(parent, seg);
      parent = `${parent}/${seg}`;
    }
    const filename = `meta-${meta.slug}.md`;
    ensureDir(dirAbs).push({ name: filename, isDirectory: () => false });
    files.set(
      `${dirAbs}/${filename}`,
      `# Metadata: ${meta.slug}\n\n` +
        `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
        `|-----------|-----------|------------|-----------|--------------|\n` +
        `| \`${meta.state}\` | \`andrew\` | \`[none]\` | \`${meta.cls ?? "Novel"}\` | \`P1\` |\n\n` +
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
  ctx: BacklogMoveContext;
  calls: string[];
}

/**
 * Build the verb context. `pruneDirs` maps absolute directory paths to their
 * post-move contents — a `[]` entry models an emptied source dir the prune walk
 * should remove; an absent path rejects (already gone). The prune fs records
 * each `rmdir` in `calls` for assertion.
 */
function buildCtx(metas: MetaSpec[], pruneDirs: Record<string, string[]> = {}): Harness {
  const calls: string[] = [];

  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user"] satisfies SideEffectId[]) {
    sideEffects[id] = () => {
      calls.push(`side:${id}`);
      return undefined;
    };
  }

  const executor: ExecuteTransitionContext = {
    cwd: CWD,
    indexFs: buildIndexFs(metas),
    setPhase: async () => ({ phase: "Planning" }),
    relocateArtifacts: async (params) => {
      calls.push(`relocate:${params.fromDir}->${params.toDir}`);
      return { moved: [`meta-${params.slug}.md`] };
    },
    reconcileBranch: async () => {},
    reconcileWorktree: async () => ({ mutation: "spawn", worktreePath: "/wt", branch: "x" }),
    writeBranchField: async () => {},
    writeCurrentWorkflowField: async () => {},
    writeSoftFields: async (path, updates) => {
      calls.push(`soft:${path}:${Object.keys(updates).join(",")}`);
    },
    sideEffects,
  };

  const fs: BacklogMoveFs = {
    readdir: (path) => {
      const entries = pruneDirs[path];
      return entries === undefined ? Promise.reject(new Error(`ENOENT: ${path}`)) : Promise.resolve(entries);
    },
    rmdir: (path) => {
      calls.push(`rmdir:${path}`);
      return Promise.resolve();
    },
  };

  return { ctx: { executor, fs }, calls };
}

const PROVISIONAL = (cls?: string): MetaSpec => ({
  slug: "foo",
  tier: "backlog/provisional",
  subdir: "foo",
  state: "Planning",
  cls,
});
const PLANNED: MetaSpec = { slug: "foo", tier: "backlog/planned", subdir: "foo", state: "Planning" };

describe("runPromote — the Class gate", () => {
  it("rejects promote when the stub's Class is still [TBD]", async () => {
    const { ctx, calls } = buildCtx([PROVISIONAL("[TBD]")]);

    const result = await runPromote(ctx, { name: "foo" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/Class/i);
    // No relocation ran — the gate fires before any mutation.
    expect(calls.some((c) => c.startsWith("relocate:"))).toBe(false);
    // No prune either — nothing moved.
    expect(calls.some((c) => c.startsWith("rmdir:"))).toBe(false);
  });

  it("rejects promote when the name is not a provisional stub", async () => {
    const { ctx, calls } = buildCtx([PLANNED]);

    const result = await runPromote(ctx, { name: "foo" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/provisional/i);
    expect(calls.some((c) => c.startsWith("relocate:"))).toBe(false);
  });
});

describe("runPromote — flat relocation (unchanged)", () => {
  it("relocates the stub to backlog/planned/ when the Class is resolved", async () => {
    const { ctx, calls } = buildCtx([PROVISIONAL("Novel")], {
      [`${CWD}/.arc/backlog/provisional/foo`]: [],
    });

    const result = await runPromote(ctx, { name: "foo" });

    expect(result.status).toBe("moved");
    if (result.status !== "moved") return;
    expect(result.outcome.status).toBe("ok");
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("promote");
      expect(result.outcome.to).toEqual({ phase: "Planning", location: "planned" });
    }
    expect(result.metaPath).toBe(".arc/backlog/planned/foo/meta-foo.md");
    expect(calls).toContain("relocate:.arc/backlog/provisional/foo->.arc/backlog/planned/foo");
    // The emptied per-WU source subdir is pruned; the tier root is never removed.
    expect(calls).toContain(`rmdir:${CWD}/.arc/backlog/provisional/foo`);
    expect(calls).not.toContain(`rmdir:${CWD}/.arc/backlog/provisional`);
  });
});

describe("runPromote — cohort-nested relocation", () => {
  const NESTED = (cls?: string): MetaSpec => ({
    slug: "foo",
    tier: "backlog/provisional",
    subdir: "coh/foo",
    state: "Planning",
    cls,
  });

  it("relocates within the cohort segment and prunes the emptied source dirs", async () => {
    const { ctx, calls } = buildCtx([NESTED("Novel")], {
      // Last member: both the WU subdir and the cohort dir are empty post-move.
      [`${CWD}/.arc/backlog/provisional/coh/foo`]: [],
      [`${CWD}/.arc/backlog/provisional/coh`]: [],
    });

    const result = await runPromote(ctx, { name: "foo" });

    expect(result.status).toBe("moved");
    if (result.status !== "moved") return;
    expect(result.metaPath).toBe(".arc/backlog/planned/coh/foo/meta-foo.md");
    // From and to both carry the cohort segment (planned-side cohort dir created by relocate's ensureDir).
    expect(calls).toContain("relocate:.arc/backlog/provisional/coh/foo->.arc/backlog/planned/coh/foo");
    // Emptied source cleanup walks up: WU subdir, then the now-empty cohort dir; stops at the tier root.
    expect(calls).toContain(`rmdir:${CWD}/.arc/backlog/provisional/coh/foo`);
    expect(calls).toContain(`rmdir:${CWD}/.arc/backlog/provisional/coh`);
    expect(calls).not.toContain(`rmdir:${CWD}/.arc/backlog/provisional`);
  });

  it("retains the cohort dir when a sibling member remains", async () => {
    const { ctx, calls } = buildCtx([NESTED("Novel"), { slug: "bar", tier: "backlog/provisional", subdir: "coh/bar", state: "Planning" }], {
      [`${CWD}/.arc/backlog/provisional/coh/foo`]: [],
      // The cohort dir still holds the sibling subdir — must not be pruned.
      [`${CWD}/.arc/backlog/provisional/coh`]: ["bar"],
    });

    const result = await runPromote(ctx, { name: "foo" });

    expect(result.status).toBe("moved");
    expect(calls).toContain(`rmdir:${CWD}/.arc/backlog/provisional/coh/foo`);
    expect(calls).not.toContain(`rmdir:${CWD}/.arc/backlog/provisional/coh`);
  });

  it("still refuses a [TBD] Class for a nested stub", async () => {
    const { ctx, calls } = buildCtx([NESTED("[TBD]")]);

    const result = await runPromote(ctx, { name: "foo" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/Class/i);
    expect(calls.some((c) => c.startsWith("relocate:"))).toBe(false);
  });
});

describe("runDemote — the sticky inverse", () => {
  it("relocates a planned stub back to provisional, preserving the realized Class", async () => {
    const { ctx, calls } = buildCtx([PLANNED], {
      [`${CWD}/.arc/backlog/planned/foo`]: [],
    });

    const result = await runDemote(ctx, { name: "foo" });

    expect(result.status).toBe("moved");
    if (result.status !== "moved") return;
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("demote");
      expect(result.outcome.to).toEqual({ phase: "Planning", location: "provisional" });
    }
    expect(result.metaPath).toBe(".arc/backlog/provisional/foo/meta-foo.md");
    expect(calls).toContain("relocate:.arc/backlog/planned/foo->.arc/backlog/provisional/foo");
    // Class-sticky: a content-preserving relocate with no soft-field rewrite —
    // nothing re-blanks the realized Class on the way down.
    expect(calls.some((c) => c.startsWith("soft:"))).toBe(false);
  });

  it("relocates a cohort-nested planned stub within its cohort segment", async () => {
    const { ctx, calls } = buildCtx(
      [{ slug: "foo", tier: "backlog/planned", subdir: "coh/foo", state: "Planning" }],
      {
        [`${CWD}/.arc/backlog/planned/coh/foo`]: [],
        [`${CWD}/.arc/backlog/planned/coh`]: [],
      },
    );

    const result = await runDemote(ctx, { name: "foo" });

    expect(result.status).toBe("moved");
    if (result.status !== "moved") return;
    expect(result.metaPath).toBe(".arc/backlog/provisional/coh/foo/meta-foo.md");
    expect(calls).toContain("relocate:.arc/backlog/planned/coh/foo->.arc/backlog/provisional/coh/foo");
    expect(calls).toContain(`rmdir:${CWD}/.arc/backlog/planned/coh/foo`);
    expect(calls).toContain(`rmdir:${CWD}/.arc/backlog/planned/coh`);
    expect(calls).not.toContain(`rmdir:${CWD}/.arc/backlog/planned`);
  });
});
