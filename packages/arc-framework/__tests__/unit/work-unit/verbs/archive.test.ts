/**
 * Unit tests for the `archive` verb — the terminal sweep to `completed/`.
 *
 * `archive` (`Active` / `Integrating → completed`) computes the dated/numbered
 * destination (`completed/{YYYY-qN}/{NN}_{name}/`) from an injected clock + a
 * quarter scan, then relocates the WU's artifact set there via the executor's
 * `relocate` leg, deleting the working branch and tearing down the worktree (the
 * edge's full encoding). The mutators reach the contract as spies, so each
 * behavior is asserted over an in-memory index without touching git or the disk.
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
    writeBranchField: async () => {},
    writeSoftFields: async (path, updates) => {
      softWrites.push({ path, updates: updates as Record<string, string> });
    },
    sideEffects,
  };

  const ctx: ArchiveContext = {
    executor,
    fs: buildQuarterFs(opts.quarterEntries ?? []),
    clock: () => new Date(2026, 5, 15, 12, 0, 0), // June 2026 → 2026-q2
  };
  return { ctx, calls, relocations, softWrites };
}

const BASE = { name: "foo", worktreePath: WORKTREE, currentLocus: CWD };

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

  it("tears down the working branch and worktree, and resets the soft fields", async () => {
    const { ctx, calls, softWrites } = buildCtx({ branch: "feat/foo" });

    const result = await runArchive(ctx, BASE);

    expect(result.status).toBe("archived");
    expect(calls).toContain("branch:delete:feat/foo");
    expect(calls).toContain(`worktree:teardown:${CWD}`);
    expect(calls).toContain("setPhase:Shipped");
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
});
