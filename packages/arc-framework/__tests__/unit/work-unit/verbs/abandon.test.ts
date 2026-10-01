/**
 * Unit tests for the `abandon` verb — the destructive inverse of `stub`.
 *
 * `abandon` removes a WU from any **pre-merge** state, leaving no residue (the
 * resolver then returns `nonexistent`). It is a destructive cascade gated on an
 * explicit confirmation (`--yes`); bare invocation refuses (safe default). The
 * cascade is phase-polymorphic: a backlog stub is just an artifact removal; a
 * started WU (`planning` / `active`) removes its artifacts in-verb but defers its
 * branch, worktree, and user-workspace cleanup until the retirement evidence has
 * landed; a `parked` WU follows the same structurally authorized branch cleanup path.
 * `integrating` and merged / `shipped` are illegal — post-merge backout is a new
 * origin-linked WU. The mutators, the remove runner, and the side-effects reach
 * the contract as spies, so each behavior is asserted over an in-memory index.
 */

import { describe, it, expect } from "vitest";

import { canonicalDigest } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import type { PatchOperation } from "../../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../../src/lib/kernel/canonical/managed-path.js";
import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { ComposedLifecycleIndexResult } from "../../../../src/lib/work-unit/composed-lifecycle-index.js";
import {
  buildLifecycleIndex,
  type DirEntry,
  type LifecycleIndexFs,
} from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import type { TransitionRecord } from "../../../../src/lib/work-unit/transition-record.js";
import { planAbandon, runAbandon, type AbandonContext, type AbandonParams } from "../../../../src/lib/work-unit/verbs/abandon.js";

const CWD = "/repo";
const WORKTREE = "/repo/../wt-foo";
const TRANSITION_OPERATIONS = [
  { operation: "delete", path: validateManagedPath(".arc/active/meta-foo.md") },
  { operation: "delete", path: validateManagedPath(".arc/active/spec-foo.md") },
] as const satisfies readonly PatchOperation[];

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
      entries.push({ name, isDirectory: () => true, isFile: () => false });
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
    ensureDir(dirAbs).push({ name: filename, isDirectory: () => false, isFile: () => true });
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
  recordedTransitions: TransitionRecord[];
}

function buildCtx(metas: MetaSpec[], worktreeClean = true): Harness {
  const calls: string[] = [];
  const removed: string[] = [];
  const rmdirs: string[] = [];
  const recordedTransitions: TransitionRecord[] = [];

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
    reconcileWorkUnitWorktree: async (op) => {
      calls.push(op.mutation === "teardown" ? `worktree:teardown:${op.currentLocus}` : `worktree:${op.mutation}`);
      return op.mutation === "teardown"
        ? { mutation: "teardown", worktreePath: op.worktreePath, locusHopped: true }
        : { mutation: "spawn", worktreePath: WORKTREE, branch: "x" };
    },
    writeBranchField: async () => {},
    writeCurrentWorkflowField: async () => {},
    writeDesignField: async () => {},
    writeSoftFields: async () => {},
    sideEffects,
    // The `worktree-clean` IO guard is a caller-supplied seam (production binds the
    // real `git status` read via `buildFootgunGuards`); the started-WU abandon
    // cells declare it as the fail-fast that keeps a dirty teardown from
    // half-applying (artifacts removed, branch/worktree intact).
    guardValidators: {
      "worktree-clean": () =>
        worktreeClean
          ? { ok: true }
          : { ok: false, message: "refusing to tear down a dirty worktree: /repo/../wt-foo has uncommitted work." },
    },
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

  const retirement: AbandonContext["retirement"] = {
    captureSource: async ({ name, expectedBranch, retirementSource }) => {
      calls.push(`retirement:capture:${name}:${removed.length}:${expectedBranch ?? "[none]"}`);
      if (retirementSource !== undefined) {
        calls.push(`retirement:unchanged:${retirementSource.branch}:${retirementSource.sourceDir}`);
      }
      return {
        scope: {
          subject: { kind: "work-unit", name },
          transition: "abandon",
          source: { branch: retirementSource?.branch ?? "feat/foo", head: "a".repeat(40) },
          resultProjection: {
            ref: retirementSource === undefined ? "feat/foo" : "main",
            head: "a".repeat(40),
          },
        },
        sourceArtifactPaths: TRANSITION_OPERATIONS.map((operation) => operation.path),
        resultArtifactPaths: [],
      };
    },
    authority: {
      readSnapshot: async () => ({
        status: "resolved",
        snapshot: {
          authorityVersion: canonicalDigest({ authority: "before-abandon" }),
          sourceRefOid: "a".repeat(40),
          resultRefOid: "a".repeat(40),
        },
      }),
    },
    stageTransition: async () => {
      calls.push("retirement:stage-transition");
    },
    rollbackTransition: async () => {
      calls.push("retirement:rollback-transition");
    },
    rollbackRefusedCommit: async () => {
      calls.push("retirement:rollback-refused");
      return { status: "rolled-back" };
    },
    completeTransition: async () => {
      calls.push("retirement:complete");
      return { status: "completed-no-record", authorityVersion: canonicalDigest({ authority: "after-abandon" }) };
    },
    readTransitionPatch: async () => TRANSITION_OPERATIONS,
  };

  return {
    ctx: {
      executor,
      fs,
      retirement,
      transitionWriter: {
        record: async (transition) => {
          calls.push("transition:record");
          recordedTransitions.push(transition);
          return { status: "recorded" };
        },
        rollback: async (transition) => {
          calls.push("transition:rollback");
          const index = recordedTransitions.indexOf(transition);
          if (index >= 0) recordedTransitions.splice(index, 1);
          return { status: "rolled-back" };
        },
      },
    },
    calls,
    removed,
    rmdirs,
    recordedTransitions,
  };
}

const BASE: AbandonParams = { name: "foo", confirmed: true };

const ACTIVE: MetaSpec = { slug: "foo", tier: "active", subdir: "", state: "Active", branch: "feat/foo" };
const PROVISIONAL: MetaSpec = { slug: "foo", tier: "backlog/provisional", subdir: "foo", state: "Planning" };
const PARKED: MetaSpec = { slug: "foo", tier: "backlog/planned", subdir: "foo", state: "Active", branch: "feat/foo" };
const INTEGRATING: MetaSpec = { slug: "foo", tier: "active", subdir: "", state: "Integrating", branch: "feat/foo" };

async function composedWithoutWriteAuthority(ctx: AbandonContext): Promise<ComposedLifecycleIndexResult> {
  return {
    index: await buildLifecycleIndex({ cwd: CWD, fs: ctx.executor.indexFs }),
    recordsBySlug: new Map(),
    qualityFacts: { warnings: [], resultMarks: [], bySlug: new Map() },
    worktreePathBySlug: new Map(),
    liveRefs: {},
    reachable: true,
    readQuality: "reachable",
  };
}

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

describe("runAbandon — composed write authority", () => {
  it("refuses a divergent subject before reading or removing checkout files", async () => {
    const { ctx, calls, removed } = buildCtx([ACTIVE]);
    ctx.composed = await composedWithoutWriteAuthority(ctx);
    ctx.executor.indexFs.readFile = () => Promise.reject(new Error("filesystem read must not occur"));

    const result = await runAbandon(ctx, BASE);

    expect(result).toEqual({
      status: "rejected",
      reason: "Cannot abandon `foo`: composed lifecycle truth does not grant current-checkout write authority.",
    });
    expect(calls).toEqual([]);
    expect(removed).toEqual([]);
  });
});

describe("runAbandon — started WU (active)", () => {
  it("captures the source branch and HEAD before removing the artifact set", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runAbandon(ctx, BASE);

    expect(result.status).toBe("abandoned");
    expect(calls).toContain("retirement:capture:foo:0:feat/foo");
    expect(calls).toContain("retirement:complete");
  });

  it("stages lean history before completing the same direct transition", async () => {
    const { ctx, calls, recordedTransitions } = buildCtx([ACTIVE]);

    const result = await runAbandon(ctx, BASE);

    expect(result.status).toBe("abandoned");
    expect(calls.indexOf("retirement:stage-transition")).toBeLessThan(calls.indexOf("transition:record"));
    expect(calls.indexOf("transition:record")).toBeLessThan(calls.indexOf("retirement:complete"));
    expect(recordedTransitions).toEqual([{
      schemaVersion: 1,
      origin: "foo",
      kind: "abandon",
      successors: [],
      edges: [],
    }]);
  });

  it("maps an occupied transition origin to a stable refusal and rolls back the direct transition", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);
    ctx.transitionWriter.record = async () => ({ status: "origin-occupied" });

    await expect(runAbandon(ctx, BASE)).resolves.toEqual({
      status: "rejected",
      reason: "The abandon transition was rolled back because transition history could not be recorded: "
        + "origin-occupied.",
    });
    expect(calls).toContain("retirement:rollback-refused");
  });

  it("rolls back transition and lean history when completion refuses", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);
    ctx.retirement.completeTransition = async () => ({
      status: "refused",
      reason: "authority-conflict",
      diagnostic: "staged paths changed",
    });

    const result = await runAbandon(ctx, BASE);

    expect(result).toMatchObject({
      status: "rejected",
      reason: expect.stringMatching(/rolled back.*staged paths changed/iu),
    });
    expect(calls).toContain("retirement:rollback-refused");
    expect(calls).toContain("transition:rollback");
    expect(calls).not.toContain("side:user-workspace");
    expect(calls.some((call) => call.startsWith("branch:"))).toBe(false);
  });

  it("records lean abandon history without receipt-shaped result evidence", async () => {
    const { ctx, recordedTransitions } = buildCtx([ACTIVE]);

    const result = await runAbandon(ctx, BASE);

    expect(result.status).toBe("abandoned");
    expect(recordedTransitions).toEqual([{
      schemaVersion: 1,
      origin: "foo",
      kind: "abandon",
      successors: [],
      edges: [],
    }]);
  });

  it("records pending cleanup without deleting refs or closing the live user workspace", async () => {
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
    // Every destructive cleanup leg stays deferred until the result
    // are authoritative on the protection-aware base.
    expect(calls.some((c) => c.startsWith("branch:") || c.startsWith("worktree:"))).toBe(false);
    expect(calls).not.toContain("side:user-workspace");
    expect(calls).toContain("side:reconcile-roadmap");
    expect(result.lifecycle).toEqual({
      subject: { slug: "foo", branch: "feat/foo" },
      transition: "abandon",
      cleanup: {
        branch: { status: "pending" },
        worktree: { status: "pending" },
        userWorkspace: { status: "pending" },
      },
      successorReadiness: {
        candidates: [],
        actionable: false,
        remedy: null,
      },
    });
  });
});

describe("runAbandon — started WU on a dirty worktree", () => {
  it("no longer gates on worktree cleanliness — the deferred teardown owns the worktree", async () => {
    const { ctx, calls, removed } = buildCtx([ACTIVE], /* worktreeClean */ false);

    const result = await runAbandon(ctx, BASE);

    // The started-WU abandon edges dropped the `worktree-clean` guard along with the
    // in-verb teardown legs it protected, so a dirty worktree no longer blocks the
    // artifact removal; structurally authorized `arc teardown` owns the worktree.
    expect(result.status).toBe("abandoned");
    if (result.status !== "abandoned") return;
    expect(removed).toContain("/repo/.arc/active/meta-foo.md");
    expect(calls.some((c) => c.startsWith("branch:") || c.startsWith("worktree:"))).toBe(false);
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
    expect(result.lifecycle.subject.branch).toBeNull();
    expect(result.lifecycle.cleanup).toEqual({
      branch: { status: "not-applicable" },
      worktree: { status: "not-applicable" },
      userWorkspace: { status: "not-applicable" },
    });
  });
});

describe("runAbandon — parked WU", () => {
  it("preserves the parked branch and defers its cleanup", async () => {
    const { ctx, calls } = buildCtx([PARKED]);

    const result = await runAbandon(ctx, { name: "foo", confirmed: true });

    expect(result.status).toBe("abandoned");
    if (result.status !== "abandoned") return;
    expect(calls).toContain("retirement:capture:foo:0:[none]");
    expect(calls).toContain("retirement:unchanged:feat/foo:.arc/active");
    expect(calls).not.toContain("branch:delete:feat/foo");
    expect(calls.some((c) => c.startsWith("worktree:"))).toBe(false);
    expect(result.lifecycle.cleanup.branch).toEqual({ status: "pending" });
    expect(result.lifecycle.cleanup.worktree).toEqual({ status: "not-applicable" });
  });
});

describe("planAbandon — the impact plan per from-state", () => {
  it("a started WU plans artifacts plus landed structural teardown", () => {
    const plan = planAbandon("active", "feat/foo", "foo");
    expect(plan.legal).toBe(true);
    expect(plan.lines.some((l) => /Artifacts:/.test(l))).toBe(true);
    expect(plan.lines.some((l) => /Teardown:.*arc teardown foo/.test(l))).toBe(true);
    expect(plan.lines.some((l) => /--force/.test(l))).toBe(false);
    // No in-verb branch-delete / worktree-teardown lines — those are out-of-band.
    expect(plan.lines.some((l) => /Branch:|Worktree:/.test(l))).toBe(false);
  });

  it("a backlog stub (provisional) plans only the artifact removal — no branch, worktree, or teardown", () => {
    const plan = planAbandon("provisional", null, "foo");
    expect(plan.legal).toBe(true);
    expect(plan.lines.some((l) => /Artifacts:/.test(l))).toBe(true);
    expect(plan.lines.some((l) => /Branch:|Worktree:|Teardown:/.test(l))).toBe(false);
  });

  it("a parked WU plans landed structural cleanup of its preserved branch", () => {
    const plan = planAbandon("parked", "feat/foo", "foo");
    expect(plan.legal).toBe(true);
    expect(plan.lines.some((l) => /Teardown:.*arc teardown foo.*feat\/foo/.test(l))).toBe(true);
    expect(plan.lines.some((l) => /Branch:|Worktree:|--force/.test(l))).toBe(false);
  });

  it("an illegal source (integrating) yields no plan", () => {
    const plan = planAbandon("integrating", "feat/foo", "foo");
    expect(plan.legal).toBe(false);
    expect(plan.lines).toEqual([]);
  });

  it("a merged / shipped WU yields no plan", () => {
    expect(planAbandon("shipped", null, "foo").legal).toBe(false);
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
