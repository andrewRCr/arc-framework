/**
 * Unit tests for the `abandon` verb — the destructive inverse of `stub`.
 *
 * `abandon` removes a WU from any **pre-merge** state, leaving no residue (the
 * resolver then returns `nonexistent`). It is a destructive cascade gated on an
 * explicit confirmation (`--yes`); bare invocation refuses (safe default). The
 * cascade is phase-polymorphic: a backlog stub is just an artifact removal; a
 * started WU (`planning` / `active`) removes its artifacts in-verb but defers its
 * branch + worktree teardown to a post-action `arc teardown --force`; a `parked` WU
 * deletes its preserved branch in-verb but has no worktree to tear down.
 * `integrating` and merged / `shipped` are illegal — post-merge backout is a new
 * origin-linked WU. The mutators, the remove runner, and the side-effects reach
 * the contract as spies, so each behavior is asserted over an in-memory index.
 */

import { describe, it, expect } from "vitest";

import { canonicalDigest } from "../../../../src/lib/canonical/canonical-json.js";
import { patchDigest, type PatchOperation } from "../../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../../src/lib/canonical/managed-path.js";
import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import {
  validateReceiptMatrix,
  type RetirementReceipt,
} from "../../../../src/lib/work-unit/retirement-authority.js";
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
  recordedReceipts: RetirementReceipt[];
}

function buildCtx(metas: MetaSpec[], worktreeClean = true): Harness {
  const calls: string[] = [];
  const removed: string[] = [];
  const rmdirs: string[] = [];
  const recordedReceipts: RetirementReceipt[] = [];
  const sourceArtifactDigest = canonicalDigest({ artifact: "foo-source" });

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
    captureSource: async ({ name }) => {
      calls.push(`retirement:capture:${name}:${removed.length}`);
      return {
        scope: {
          subject: { kind: "work-unit", name },
          transition: "abandon",
          source: { branch: "feat/foo", head: "a".repeat(40) },
          resultProjection: { ref: "feat/foo", head: "a".repeat(40) },
        },
        artifactDigest: sourceArtifactDigest,
        sourceArtifactPaths: TRANSITION_OPERATIONS.map((operation) => operation.path),
      };
    },
    authority: {
      readSnapshot: async () => ({
        status: "resolved",
        snapshot: {
          authorityVersion: canonicalDigest({ authority: "before-abandon" }),
          sourceRefOid: "a".repeat(40),
          resultRefOid: "a".repeat(40),
          recordState: "absent",
        },
      }),
      record: async (receipt) => {
        calls.push("retirement:record");
        recordedReceipts.push(receipt);
        return { status: "recorded", authorityVersion: canonicalDigest({ authority: "after-abandon" }) };
      },
    },
    stageTransition: async () => {
      calls.push("retirement:stage-transition");
    },
    readTransitionPatch: async () => TRANSITION_OPERATIONS,
  };

  return { ctx: { executor, fs, retirement }, calls, removed, rmdirs, recordedReceipts };
}

const BASE: AbandonParams = { name: "foo", confirmed: true };

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
  it("captures the source branch, HEAD, and artifact digest before removing the artifact set", async () => {
    const { ctx, calls, recordedReceipts } = buildCtx([ACTIVE]);

    const result = await runAbandon(ctx, BASE);

    expect(result.status).toBe("abandoned");
    expect(calls).toContain("retirement:capture:foo:0");
    expect(recordedReceipts).toHaveLength(1);
    expect(recordedReceipts[0]?.source).toEqual({
      branch: "feat/foo",
      head: "a".repeat(40),
      artifactDigest: canonicalDigest({ artifact: "foo-source" }),
    });
    expect(recordedReceipts[0]?.transitionPatchDigest).toBe(patchDigest(TRANSITION_OPERATIONS));
  });

  it("stages the transition before recording the receipt for the same commit", async () => {
    const { ctx, calls, recordedReceipts } = buildCtx([ACTIVE]);

    const result = await runAbandon(ctx, BASE);

    expect(result.status).toBe("abandoned");
    expect(calls).toContain("retirement:record");
    expect(calls.indexOf("retirement:stage-transition")).toBeLessThan(calls.indexOf("retirement:record"));
    expect(recordedReceipts).toHaveLength(1);
  });

  it("records the explicit absent result for a nonexistent lifecycle outcome", async () => {
    const { ctx, recordedReceipts } = buildCtx([ACTIVE]);

    const result = await runAbandon(ctx, BASE);

    expect(result.status).toBe("abandoned");
    expect(recordedReceipts[0]).toMatchObject({
      transition: "abandon",
      authorization: "discard-confirmed",
      result: { kind: "discard", artifactDigest: "absent" },
    });
    const [recorded] = recordedReceipts;
    if (recorded === undefined) throw new Error("expected an abandon receipt");
    expect(validateReceiptMatrix(recorded, "nonexistent")).toBeNull();
    expect(validateReceiptMatrix(recorded, "planned")).toBe("evidence-mismatch");
  });

  it("removes the artifact set but defers branch + worktree teardown out-of-band", async () => {
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
    // Branch + worktree teardown is out-of-band (post-action `arc teardown --force`):
    // no in-verb branch-delete or worktree-teardown leg fires.
    expect(calls.some((c) => c.startsWith("branch:") || c.startsWith("worktree:"))).toBe(false);
    // The user-workspace satellite is closed and the readiness views regen.
    expect(calls).toContain("side:user-workspace");
    expect(calls).toContain("side:reconcile-roadmap");
  });
});

describe("runAbandon — started WU on a dirty worktree", () => {
  it("no longer gates on worktree cleanliness — the deferred teardown owns the worktree", async () => {
    const { ctx, calls, removed } = buildCtx([ACTIVE], /* worktreeClean */ false);

    const result = await runAbandon(ctx, BASE);

    // The started-WU abandon edges dropped the `worktree-clean` guard along with the
    // in-verb teardown legs it protected, so a dirty worktree no longer blocks the
    // artifact removal; the post-action `arc teardown --force` owns the worktree.
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
  it("a started WU (active) plans artifacts + a post-action teardown, no in-verb branch/worktree legs", () => {
    const plan = planAbandon("active", "feat/foo", "foo");
    expect(plan.legal).toBe(true);
    expect(plan.lines.some((l) => /Artifacts:/.test(l))).toBe(true);
    expect(plan.lines.some((l) => /Teardown:.*arc teardown foo --force/.test(l))).toBe(true);
    // No in-verb branch-delete / worktree-teardown lines — those are out-of-band.
    expect(plan.lines.some((l) => /Branch:|Worktree:/.test(l))).toBe(false);
  });

  it("a backlog stub (provisional) plans only the artifact removal — no branch, worktree, or teardown", () => {
    const plan = planAbandon("provisional", null, "foo");
    expect(plan.legal).toBe(true);
    expect(plan.lines.some((l) => /Artifacts:/.test(l))).toBe(true);
    expect(plan.lines.some((l) => /Branch:|Worktree:|Teardown:/.test(l))).toBe(false);
  });

  it("a parked WU plans an in-verb branch delete but no worktree or post-action teardown", () => {
    const plan = planAbandon("parked", "feat/foo", "foo");
    expect(plan.legal).toBe(true);
    expect(plan.lines.some((l) => /Branch:.*feat\/foo.*local \+ remote/.test(l))).toBe(true);
    expect(plan.lines.some((l) => /Worktree:|Teardown:/.test(l))).toBe(false);
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
