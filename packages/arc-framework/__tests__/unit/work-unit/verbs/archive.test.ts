/**
 * Unit tests for the `archive` verb — the mergeable sweep to `completed/`.
 *
 * `archive` (`Active` / `Integrating → completed`) computes the dated/numbered
 * destination (`completed/{YYYY-qN}/{NN}_{name}/`) from an injected clock + a
 * quarter scan, then relocates the WU's artifact set there via the executor's
 * `relocate` leg, flips `State → Shipped`, and clears the `Branch` field to
 * `[none]` (logical, no git op) — the half of the ship that rides the PR. Physical
 * branch/worktree teardown is deferred to post-merge cleanup, so the verb fires
 * neither leg. The mutators reach the contract as spies, so each behavior is
 * asserted over an in-memory index without touching git or the disk.
 */

import { describe, it, expect } from "vitest";

import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type {
  DirEntry,
  LifecycleIndex,
  LifecycleIndexEntry,
  LifecycleIndexFs,
} from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { Location, Phase } from "../../../../src/lib/work-unit/lifecycle-state.js";
import type {
  RelocateArtifactsParams,
  RelocateArtifactsResult,
} from "../../../../src/lib/work-unit/mutators/relocate-artifacts.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import type { CompletedIndexFs } from "../../../../src/lib/work-unit/completed-index.js";
import { runArchive, sweepCohortDoc, type ArchiveContext } from "../../../../src/lib/work-unit/verbs/archive.js";

const CWD = "/repo";
const WORKTREE = "/repo/../wt-foo";

/** Build an injectable lifecycle-index fs holding one Active/Integrating meta in `active/`. */
function buildIndexFs(slug: string, state: string, branch: string): LifecycleIndexFs {
  const dir = `${CWD}/.arc/active`;
  const filename = `meta-${slug}.md`;
  const entries: DirEntry[] = [{ name: filename, isDirectory: () => false }];
  const content =
    `# Metadata: ${slug}\n\n` +
    `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
    `|-----------|-----------|------------|-----------|--------------|\n` +
    `| \`${state}\` | \`andrew\` | \`${branch}\` | \`Novel\` | \`P1\` |\n\n` +
    `- **Last Completed:** Task 9.9 — wrap up\n- **Next Task:** [none]\n- **Blockers:** [none]\n\n` +
    `- **Next Action:** ship it.\n\n---\n`;

  return {
    readdir: (path) => (path === dir ? Promise.resolve(entries) : Promise.reject(new Error(`ENOENT: ${path}`))),
    readFile: (path) =>
      path === `${dir}/${filename}` ? Promise.resolve(content) : Promise.reject(new Error(`ENOENT: ${path}`)),
  };
}

interface Harness {
  ctx: ArchiveContext;
  calls: string[];
  relocations: RelocateArtifactsParams[];
  softWrites: { path: string; updates: Record<string, string> }[];
  branchWrites: string[];
  finalizeWrites: { path: string; facts: { prUrl?: string; completed?: string } }[];
  staged: string[];
}

/** A quarter scan returning a fixed set of existing archive entries. */
function buildQuarterFs(entries: string[]): CompletedIndexFs {
  return { readdir: async () => entries };
}

function buildCtx(opts: {
  slug?: string;
  state?: string;
  branch?: string;
  quarterEntries?: string[];
}): Harness {
  const slug = opts.slug ?? "foo";
  const calls: string[] = [];
  const relocations: RelocateArtifactsParams[] = [];
  const softWrites: { path: string; updates: Record<string, string> }[] = [];
  const branchWrites: string[] = [];
  const finalizeWrites: Harness["finalizeWrites"] = [];
  const staged: string[] = [];

  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user", "user-workspace"] satisfies SideEffectId[]) {
    sideEffects[id] = () => {
      calls.push(`side:${id}`);
      return undefined;
    };
  }

  const executor: ExecuteTransitionContext = {
    cwd: CWD,
    indexFs: buildIndexFs(slug, opts.state ?? "Integrating", opts.branch ?? "feat/foo"),
    setPhase: async ({ phase }) => {
      calls.push(`setPhase:${phase}`);
      return { phase: "Shipped" };
    },
    relocateArtifacts: async (params) => {
      relocations.push(params);
      calls.push(`relocate:${params.fromDir}->${params.toDir}`);
      return { moved: [`meta-${slug}.md`] };
    },
    reconcileBranch: async (op) => {
      calls.push(op.mutation === "delete" ? `branch:delete:${op.branch}` : `branch:${op.mutation}`);
    },
    reconcileWorktree: async (op) => {
      calls.push(op.mutation === "teardown" ? `worktree:teardown:${op.currentLocus}` : `worktree:${op.mutation}`);
      return op.mutation === "teardown"
        ? { mutation: "teardown", worktreePath: op.worktreePath, locusHopped: true }
        : { mutation: "spawn", worktreePath: WORKTREE, branch: "x" };
    },
    writeBranchField: async (_path, branch) => {
      branchWrites.push(branch);
    },
    writeCurrentWorkflowField: async () => {},
    writeDesignField: async () => {},
    writeSoftFields: async (path, updates) => {
      softWrites.push({ path, updates: updates as Record<string, string> });
    },
    writeFinalizeFields: async (path, facts) => {
      finalizeWrites.push({ path, facts });
    },
    stageMeta: async (path) => {
      staged.push(path);
    },
    sideEffects,
  };

  const ctx: ArchiveContext = {
    executor,
    fs: buildQuarterFs(opts.quarterEntries ?? []),
    clock: () => new Date(2026, 5, 15, 12, 0, 0), // June 2026 → 2026-q2
  };
  return { ctx, calls, relocations, softWrites, branchWrites, finalizeWrites, staged };
}

const BASE = { name: "foo" };

describe("runArchive — the dated sweep", () => {
  it("relocates the artifact set to the computed completed/ path", async () => {
    const { ctx, calls, relocations } = buildCtx({ quarterEntries: ["24_lifecycle-state-resolver"] });

    const result = await runArchive(ctx, BASE);

    expect(result.status).toBe("archived");
    if (result.status !== "archived") return;
    expect(result.destination.toDir).toBe(".arc/completed/2026-q2/25_foo");
    expect(result.metaPath).toBe(".arc/completed/2026-q2/25_foo/meta-foo.md");
    // The relocate leg moves the active/ set into the computed destination.
    expect(relocations).toEqual([
      { slug: "foo", fromDir: ".arc/active", toDir: ".arc/completed/2026-q2/25_foo" },
    ]);
    expect(calls).toContain("relocate:.arc/active->.arc/completed/2026-q2/25_foo");
  });

  it("flips State, clears the Branch field logically, fires no physical teardown, and resets soft fields", async () => {
    const { ctx, calls, softWrites, branchWrites } = buildCtx({ branch: "feat/foo" });

    const result = await runArchive(ctx, BASE);

    expect(result.status).toBe("archived");
    expect(calls).toContain("setPhase:Shipped");
    // The Branch field clears logically to [none] — no git ref op.
    expect(branchWrites).toContain("[none]");
    // Physical branch/worktree teardown is the integration tail's post-merge cleanup;
    // the verb fires neither leg.
    expect(calls.some((c) => c.startsWith("branch:"))).toBe(false);
    expect(calls.some((c) => c.startsWith("worktree:"))).toBe(false);
    expect(calls).toContain("side:user-workspace");
    // Soft fields are written at the relocated meta path; Next Task / Action / Blockers reset, Last Completed left.
    const write = softWrites.find((w) => w.path.includes(".arc/completed/2026-q2/"));
    expect(write?.updates).toMatchObject({ "Next Task": "[none]", "Next Action": "[none]", Blockers: "[none]" });
    expect(write?.updates).not.toHaveProperty("Last Completed");
  });

  it("archives an Active WU as well as an Integrating one", async () => {
    const { ctx } = buildCtx({ state: "Active" });

    const result = await runArchive(ctx, BASE);

    expect(result.status).toBe("archived");
    if (result.status !== "archived") return;
    expect(result.outcome.status).toBe("ok");
  });

  it("rejects when the WU is not in active/ (nothing to archive)", async () => {
    const { ctx, calls } = buildCtx({ slug: "foo" });

    const result = await runArchive(ctx, { ...BASE, name: "ghost" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/archive|active/i);
    expect(calls.some((c) => c.startsWith("relocate:"))).toBe(false);
  });

  it("writes both finalize facts to the relocated meta and re-stages it in one call", async () => {
    const { ctx, finalizeWrites, staged } = buildCtx({});

    const result = await runArchive(ctx, {
      ...BASE,
      prUrl: "https://github.com/x/y/pull/9",
      completed: "2026-06-18",
    });

    expect(result.status).toBe("archived");
    expect(finalizeWrites).toEqual([
      {
        path: ".arc/completed/2026-q2/01_foo/meta-foo.md",
        facts: { prUrl: "https://github.com/x/y/pull/9", completed: "2026-06-18" },
      },
    ]);
    // The finalize write rewrote the relocated meta, so it re-stages.
    expect(staged).toContain(".arc/completed/2026-q2/01_foo/meta-foo.md");
  });

  it("warns and writes the `[none]` placeholder when no --pr-url is supplied (backfill path)", async () => {
    const { ctx, finalizeWrites } = buildCtx({});

    const result = await runArchive(ctx, { ...BASE, completed: "2026-06-18" });

    expect(result.status).toBe("archived");
    if (result.status !== "archived") return;
    expect(finalizeWrites[0]?.facts.prUrl).toBe("[none]");
    expect(result.warnings.some((w) => /pr.?url|backfill/i.test(w))).toBe(true);
  });

  it("defaults --completed to the injected clock, and honors an explicit date", async () => {
    const dflt = buildCtx({});
    const r1 = await runArchive(dflt.ctx, { ...BASE, prUrl: "https://x/pull/1" });
    expect(r1.status).toBe("archived");
    expect(dflt.finalizeWrites[0]?.facts.completed).toBe("2026-06-15"); // the injected June-15 clock

    const explicit = buildCtx({});
    await runArchive(explicit.ctx, { ...BASE, prUrl: "https://x/pull/1", completed: "2025-01-02" });
    expect(explicit.finalizeWrites[0]?.facts.completed).toBe("2025-01-02");
  });

  it("reports no cohort sweep for a standalone WU (no Cohort field)", async () => {
    // The default fixture meta carries no Cohort field — the sweep never fires.
    const { ctx } = buildCtx({});

    const result = await runArchive(ctx, BASE);

    expect(result.status).toBe("archived");
    if (result.status !== "archived") return;
    expect(result.cohortSwept).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cohort-doc archival sweep — gated on the resolver's `isArchivalTriggered`
// ---------------------------------------------------------------------------

/** A lifecycle-index entry, mirroring the membership-test fixture shape. */
function entry(slug: string, location: Location, cohort: string | null, phase: Phase = "Planning"): LifecycleIndexEntry {
  return { slug, phase, location, cohort, dependsOn: [], path: `.arc/${location}/meta-${slug}.md` };
}

function indexOf(...entries: LifecycleIndexEntry[]): LifecycleIndex {
  return new Map(entries.map((e) => [e.slug, e]));
}

/** A `relocateArtifacts` spy recording its params; `moved` controls the reported result. */
function relocateSpy(moved: string[]): {
  fn: (params: RelocateArtifactsParams) => Promise<RelocateArtifactsResult>;
  calls: RelocateArtifactsParams[];
} {
  const calls: RelocateArtifactsParams[] = [];
  return {
    calls,
    fn: async (params) => {
      calls.push(params);
      return { moved };
    },
  };
}

describe("sweepCohortDoc — the cohort-doc archival sweep", () => {
  const at = { quarter: "2026-q2", sequence: "25" };

  it("git mvs cohort-<name>.md to the NNa_cohort sidecar when the last member has shipped", async () => {
    const index = indexOf(
      entry("a", "completed", "lifecycle-state-machine", "Shipped"),
      entry("b", "completed", "lifecycle-state-machine", "Shipped"),
    );
    const { fn, calls } = relocateSpy(["cohort-lifecycle-state-machine.md"]);

    const swept = await sweepCohortDoc(fn, index, { cohort: "lifecycle-state-machine", ...at });

    expect(calls).toEqual([
      {
        slug: "lifecycle-state-machine",
        fromDir: ".arc/backlog/planned/lifecycle-state-machine",
        toDir: ".arc/completed/2026-q2/25a_cohort-lifecycle-state-machine",
      },
    ]);
    expect(swept).toBe(".arc/completed/2026-q2/25a_cohort-lifecycle-state-machine/cohort-lifecycle-state-machine.md");
  });

  it("does not fire while any member remains outside completed/", async () => {
    const lingering = indexOf(
      entry("a", "completed", "c", "Shipped"),
      entry("b", "active", "c", "Active"),
    );
    const { fn, calls } = relocateSpy(["cohort-c.md"]);

    const swept = await sweepCohortDoc(fn, lingering, { cohort: "c", ...at });

    expect(calls).toEqual([]);
    expect(swept).toBeNull();
  });

  it("resolves the leaf segment for a nested cohort path", async () => {
    const index = indexOf(entry("leaf", "completed", "core/sub", "Shipped"));
    const { fn, calls } = relocateSpy(["cohort-sub.md"]);

    const swept = await sweepCohortDoc(fn, index, { cohort: "core/sub", ...at });

    expect(calls[0]).toMatchObject({
      slug: "sub",
      fromDir: ".arc/backlog/planned/core/sub",
      toDir: ".arc/completed/2026-q2/25a_cohort-sub",
    });
    expect(swept).toBe(".arc/completed/2026-q2/25a_cohort-sub/cohort-sub.md");
  });

  it("is a no-op for a standalone WU or the [none] sentinel", async () => {
    const index = indexOf(entry("solo", "completed", null, "Shipped"));
    const { fn, calls } = relocateSpy(["x"]);

    expect(await sweepCohortDoc(fn, index, { cohort: null, ...at })).toBeNull();
    expect(await sweepCohortDoc(fn, index, { cohort: "[none]", ...at })).toBeNull();
    expect(await sweepCohortDoc(fn, index, { cohort: "  ", ...at })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("returns null when the trigger holds but no cohort doc was found to move", async () => {
    const index = indexOf(entry("a", "completed", "c", "Shipped"));
    const { fn } = relocateSpy([]); // nothing matched in the source dir

    expect(await sweepCohortDoc(fn, index, { cohort: "c", ...at })).toBeNull();
  });

  it("refuses to construct an escaping path from a traversal cohort field", async () => {
    // A `..` segment (or absolute/backslash/drive escape) must no-op: no path is
    // built and no relocate fires, even though the member shows as shipped.
    const { fn, calls } = relocateSpy(["x"]);

    for (const cohort of ["../../../etc", "../escape", "/absolute", "a\\b", "C:\\win"]) {
      const index = indexOf(entry("a", "completed", cohort, "Shipped"));
      expect(await sweepCohortDoc(fn, index, { cohort, ...at })).toBeNull();
    }
    expect(calls).toEqual([]);
  });

  it("still sweeps a normal single-segment cohort field", async () => {
    const index = indexOf(entry("a", "completed", "safe-cohort", "Shipped"));
    const { fn, calls } = relocateSpy(["cohort-safe-cohort.md"]);

    const swept = await sweepCohortDoc(fn, index, { cohort: "safe-cohort", ...at });

    expect(calls).toEqual([
      {
        slug: "safe-cohort",
        fromDir: ".arc/backlog/planned/safe-cohort",
        toDir: ".arc/completed/2026-q2/25a_cohort-safe-cohort",
      },
    ]);
    expect(swept).toBe(".arc/completed/2026-q2/25a_cohort-safe-cohort/cohort-safe-cohort.md");
  });
});
