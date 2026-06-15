/**
 * Unit tests for the `promote` / `demote` backlog-tier inverse pair.
 *
 * Both are content-preserving relocations between the two backlog tiers
 * (`provisional` ↔ `planned`). `promote` carries the Class ratchet — it refuses
 * to raise a stub whose `Class` is still `[TBD]`, reading the realized value
 * from the source meta to feed the guard. `demote` is the unguarded inverse: it
 * lowers a planned stub back to provisional and never re-blanks the realized
 * Class (the ratchet is sticky). The relocate mutator and side-effects reach the
 * executor as spies, so each behavior is asserted over an in-memory index.
 */

import { describe, it, expect } from "vitest";

import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import { runPromote, runDemote } from "../../../../src/lib/work-unit/verbs/promote-demote.js";

const CWD = "/repo";

interface MetaSpec {
  slug: string;
  /** Lifecycle tier directory under `.arc/` (e.g. `backlog/provisional`). */
  tier: string;
  /** Per-WU subdir under the tier (the backlog layout). */
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
  ctx: ExecuteTransitionContext;
  calls: string[];
}

function buildCtx(metas: MetaSpec[]): Harness {
  const calls: string[] = [];

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
    setPhase: async () => ({ phase: "Planning" }),
    relocateArtifacts: async (params) => {
      calls.push(`relocate:${params.fromDir}->${params.toDir}`);
      return { moved: [`meta-${params.slug}.md`] };
    },
    reconcileBranch: async () => {},
    reconcileWorktree: async () => ({ mutation: "spawn", worktreePath: "/wt", branch: "x" }),
    writeSoftFields: async (path, updates) => {
      calls.push(`soft:${path}:${Object.keys(updates).join(",")}`);
    },
    sideEffects,
  };

  return { ctx, calls };
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
  });

  it("relocates the stub to backlog/planned/ when the Class is resolved", async () => {
    const { ctx, calls } = buildCtx([PROVISIONAL("Novel")]);

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
  });
});

describe("runDemote — the sticky inverse", () => {
  it("relocates a planned stub back to provisional, preserving the realized Class", async () => {
    const { ctx, calls } = buildCtx([PLANNED]);

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
});
