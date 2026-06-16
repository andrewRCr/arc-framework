/**
 * Unit tests for the `park` / `resume` location-axis inverse pair.
 *
 * `park` is phase-polymorphic. From `Planning` it routes through the executor:
 * tear the (codeless) `plan/` branch down and relocate `active/ → backlog/planned/`
 * (resolves `planned`). From `Active` it is **verb-orchestrated**: preserve the
 * pushed branch (the durable shelf), tear down only the worktree, and render a
 * minimal **pointer-record** *fresh* on the tracked branch — no git-mv relocate,
 * since the authoritative artifacts ride the preserved branch (resolves `parked`).
 * `resume` is the inverse — re-attach the preserved branch (spawn or `--here`) and
 * remove the tracked-branch pointer-record (the artifacts come back on the branch).
 *
 * The executor's mutators / side-effects reach the verb as spies and the
 * pointer-record fs as an in-memory seam, so each behavior is asserted over an
 * ordered call log and the recorded writes / removals.
 */

import { describe, it, expect } from "vitest";

import { parseMetaRecord, type MetaFieldName } from "../../../../src/lib/active/meta-reader.js";
import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import {
  runPark,
  runResume,
  type ParkContext,
  type ParkParams,
  type ResumeParams,
} from "../../../../src/lib/work-unit/verbs/park-resume.js";

const CWD = "/repo";
const WORKTREE = "/repo/../wt-foo";
const LOCUS = "/repo/../wt-foo";

interface MetaSpec {
  slug: string;
  /** Lifecycle tier directory under `.arc/` (e.g. `active`, `backlog/planned`). */
  tier: string;
  /** Per-WU subdir under the tier; empty for the flat `active/` layout. */
  subdir: string;
  state: string;
  branch?: string;
  cls?: string;
  cohort?: string;
}

/** The on-disk meta body for a spec — shared by the index fs and {@link recordFor}. */
function metaContent(meta: MetaSpec): string {
  return (
    `# Metadata: ${meta.slug}\n\n` +
    `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
    `|-----------|-----------|------------|-----------|--------------|\n` +
    `| \`${meta.state}\` | \`andrew\` | \`${meta.branch ?? "[none]"}\` | \`${meta.cls ?? "Novel"}\` | \`P1\` |\n\n` +
    `- **Cohort:** ${meta.cohort ?? "[none]"}\n- **Depends On:** [none]\n\n` +
    `- **Last Completed:** [none]\n- **Next Task:** Task 4.3 — park.\n- **Blockers:** [none]\n\n` +
    `- **Next Action:** continue.\n\n---\n`
  );
}

/** The parsed source meta the handler passes to `runPark` (read from the WU's own worktree). */
function recordFor(meta: MetaSpec): Record<MetaFieldName, string | null> {
  return parseMetaRecord(metaContent(meta));
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
    files.set(`${dirAbs}/${filename}`, metaContent(meta));
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
  ctx: ParkContext;
  calls: string[];
  writes: { path: string; content: string }[];
  removals: string[];
}

function buildCtx(metas: MetaSpec[], occupancyOk = true): Harness {
  const calls: string[] = [];
  const writes: Harness["writes"] = [];
  const removals: string[] = [];

  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user", "user-workspace"] satisfies SideEffectId[]) {
    sideEffects[id] = () => {
      calls.push(`side:${id}`);
      return undefined;
    };
  }

  const executor: ExecuteTransitionContext = {
    cwd: CWD,
    indexFs: buildIndexFs(metas),
    setPhase: async () => ({ phase: "Active" }),
    relocateArtifacts: async (params) => {
      calls.push(`relocate:${params.fromDir}->${params.toDir}`);
      return { moved: [`meta-${params.slug}.md`] };
    },
    reconcileBranch: async (op) => {
      calls.push(`branch:${op.mutation}${op.mutation === "delete" ? `:${op.branch}` : ""}`);
    },
    reconcileWorktree: async (op) => {
      calls.push(op.mutation === "spawn" && op.inPlace ? "worktree:spawn:in-place" : `worktree:${op.mutation}`);
      return op.mutation === "teardown"
        ? { mutation: "teardown", worktreePath: op.worktreePath, locusHopped: true }
        : { mutation: "spawn", worktreePath: WORKTREE, branch: op.branch };
    },
    writeBranchField: async () => {},
    writeSoftFields: async (path, updates) => {
      calls.push(`soft:${path}:${Object.keys(updates).join(",")}`);
    },
    sideEffects,
    // The `worktree-clean` / `worktree-occupancy` IO guards are injected seams
    // (the CLI binds the real worktree reads); both pass by default here.
    guardValidators: {
      "worktree-clean": () => ({ ok: true }),
      "worktree-occupancy": () =>
        occupancyOk ? { ok: true } : { ok: false, message: "worktree already holds an active work unit `other`." },
    },
  };

  const fs: ParkContext["fs"] = {
    writeFile: async (path, content) => {
      writes.push({ path: String(path), content });
    },
    mkdir: async () => undefined,
    rm: async (path) => {
      removals.push(String(path));
    },
    // The parked dir holds only the pointer-record under the minimal-pointer model,
    // so after its removal the dir is empty and the prune's `rmdir` fires.
    readdir: async () => [],
    rmdir: async (path) => {
      removals.push(`rmdir:${String(path)}`);
    },
  };

  return { ctx: { executor, fs }, calls, writes, removals };
}

const ACTIVE: MetaSpec = {
  slug: "foo",
  tier: "active",
  subdir: "",
  state: "Active",
  branch: "feat/foo",
  cohort: "demo-cohort",
};
const PLANNING: MetaSpec = { slug: "foo", tier: "active", subdir: "", state: "Planning", branch: "plan/foo" };
const INTEGRATING: MetaSpec = { slug: "foo", tier: "active", subdir: "", state: "Integrating", branch: "feat/foo" };
const PARKED: MetaSpec = {
  slug: "foo",
  tier: "backlog/planned",
  subdir: "foo",
  state: "Active",
  branch: "feat/foo",
};

const BASE_PARK: ParkParams = {
  name: "foo",
  reason: "pivoting to the upstream dependency first",
  sourceRecord: recordFor(ACTIVE),
  worktreePath: WORKTREE,
  currentLocus: LOCUS,
};

const BASE_RESUME: ResumeParams = {
  name: "foo",
  locationTemplate: "../{repo}-{branch}",
  repo: "arc-framework",
  spawningIdentity: "andrew",
};

describe("runPark — park@Planning", () => {
  it("tears down the branch and relocates to backlog/planned/ (resolves planned)", async () => {
    const { ctx, calls } = buildCtx([PLANNING]);

    const result = await runPark(ctx, { ...BASE_PARK, sourceRecord: recordFor(PLANNING) });

    expect(result.status).toBe("parked");
    if (result.status !== "parked") return;
    expect(result.outcome.status).toBe("ok");
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("park");
      expect(result.outcome.to).toEqual({ phase: "Planning", location: "planned" });
    }
    expect(result.metaPath).toBe(".arc/backlog/planned/foo/meta-foo.md");
    expect(calls).toContain("relocate:.arc/active->.arc/backlog/planned/foo");
    expect(calls).toContain("branch:delete:plan/foo");
    expect(calls).toContain("worktree:teardown");
    // No pointer-record on the Planning arm — there is no preserved branch to point at.
    expect(result.pointerRecord).toBeUndefined();
  });
});

describe("runPark — park@Active", () => {
  it("preserves the branch, tears down only the worktree, and renders a fresh pointer (no relocate)", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runPark(ctx, BASE_PARK);

    expect(result.status).toBe("parked");
    if (result.status !== "parked") return;
    if (result.outcome.status === "ok") {
      expect(result.outcome.to).toEqual({ phase: "Active", location: "planned" });
    }
    // Verb-orchestrated: the worktree is torn down, but the artifacts are NOT
    // git-mv'd (they ride the preserved branch) and the branch is preserved.
    expect(calls).toContain("worktree:teardown");
    expect(calls.some((c) => c.startsWith("relocate:"))).toBe(false);
    expect(calls.some((c) => c.startsWith("branch:"))).toBe(false);
    // The edge's side-effects fire from the verb (it does not route through the executor).
    expect(calls).toContain("side:user-workspace");
    expect(calls).toContain("side:reconcile-status-user");
  });

  it("writes the pointer-record opened by a derived-state callout carrying the reason", async () => {
    const { ctx, writes } = buildCtx([ACTIVE]);

    const result = await runPark(ctx, BASE_PARK);

    expect(result.status).toBe("parked");
    if (result.status !== "parked") return;
    // The pointer-record lands fresh at the parked meta path and is returned for surfacing.
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe("/repo/.arc/backlog/planned/foo/meta-foo.md");
    const pointer = writes[0]!.content;
    expect(result.pointerRecord).toBe(pointer);
    // Derived-state callout: parked notice, authoritative branch, the reason.
    expect(pointer).toContain("Parked");
    expect(pointer).toContain("feat/foo");
    expect(pointer).toContain("pivoting to the upstream dependency first");
    expect(pointer).toContain("do not hand-edit");
    // Blessed render shape: State stays the literal `Active` (parked is derived
    // from location), the authoritative branch is carried, render fields survive.
    const record = parseMetaRecord(pointer);
    expect(record.State).toBe("Active");
    expect(record.Branch).toBe("feat/foo");
    expect(record.Cohort).toBe("demo-cohort");
  });

  it("rejects when the preserved-branch worktree is dirty (teardown gate, nothing written)", async () => {
    const { ctx, writes } = buildCtx([ACTIVE]);
    // Override the teardown to refuse a dirty worktree (the mutator's clean-guard).
    ctx.executor.reconcileWorktree = async () => {
      throw new Error("refusing to tear down a dirty worktree: /repo/../wt-foo");
    };

    const result = await runPark(ctx, BASE_PARK);

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/dirty|clean/i);
    // Teardown gates before any write — no pointer-record left behind.
    expect(writes).toEqual([]);
  });
});

describe("runPark — the reason is required", () => {
  it("rejects a park with no reason, writing nothing and dispatching no transition", async () => {
    const { ctx, calls, writes } = buildCtx([ACTIVE]);

    const result = await runPark(ctx, { ...BASE_PARK, reason: undefined });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/reason/i);
    expect(writes).toEqual([]);
    expect(calls.some((c) => c.startsWith("relocate:") || c.startsWith("worktree:"))).toBe(false);
  });
});

describe("runPark — guards park-from-Integrating", () => {
  it("rejects parking an Integrating WU (withdraw via reopen first)", async () => {
    const { ctx, writes, calls } = buildCtx([INTEGRATING]);

    const result = await runPark(ctx, { ...BASE_PARK, sourceRecord: recordFor(INTEGRATING) });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/reopen|integrat/i);
    expect(writes).toEqual([]);
    expect(calls.some((c) => c.startsWith("relocate:") || c.startsWith("worktree:"))).toBe(false);
  });
});

describe("runResume — the inverse", () => {
  it("re-attaches the preserved branch and removes the pointer-record (no relocate)", async () => {
    const { ctx, calls, removals } = buildCtx([PARKED]);

    const result = await runResume(ctx, BASE_RESUME);

    expect(result.status).toBe("resumed");
    if (result.status !== "resumed") return;
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("resume");
      expect(result.outcome.to).toEqual({ phase: "Active", location: "active" });
    }
    expect(result.metaPath).toBe(".arc/active/meta-foo.md");
    // Re-attach: the worktree spawns; no relocate, no branch re-creation.
    expect(calls).toContain("worktree:spawn");
    expect(calls.some((c) => c.startsWith("relocate:"))).toBe(false);
    expect(calls.some((c) => c.startsWith("branch:"))).toBe(false);
    // The tracked-branch pointer-record is removed and its emptied dir pruned.
    expect(removals).toContain("/repo/.arc/backlog/planned/foo/meta-foo.md");
    expect(removals).toContain("rmdir:/repo/.arc/backlog/planned/foo");
  });

  it("re-attaches in place (`--here`) — checks out the preserved branch, no spawn", async () => {
    const { ctx, calls, removals } = buildCtx([PARKED]);

    const result = await runResume(ctx, { name: "foo", inPlace: true });

    expect(result.status).toBe("resumed");
    if (result.status !== "resumed") return;
    expect(result.metaPath).toBe(".arc/active/meta-foo.md");
    // In-place placement (checkout existing); no fresh worktree, no relocate, no branch leg.
    expect(calls).toContain("worktree:spawn:in-place");
    expect(calls).not.toContain("worktree:spawn");
    expect(calls.some((c) => c.startsWith("relocate:"))).toBe(false);
    expect(calls.some((c) => c.startsWith("branch:"))).toBe(false);
    expect(removals).toContain("/repo/.arc/backlog/planned/foo/meta-foo.md");
  });

  it("refuses when the checkout already holds an active WU (worktree-occupancy guard)", async () => {
    const { ctx, calls, removals } = buildCtx([PARKED], /* occupancyOk */ false);

    const result = await runResume(ctx, { name: "foo", inPlace: true });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/already holds an active work unit/i);
    // Refusal is total — no placement, no pointer removal.
    expect(calls.some((c) => c.startsWith("relocate:") || c.startsWith("worktree:"))).toBe(false);
    expect(removals).toEqual([]);
  });
});
