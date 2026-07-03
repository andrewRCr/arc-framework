/**
 * Unit tests for the `teardown` verb — the arc-state authority gate, branch
 * resolution (slug enumeration + ambiguity), and the presence-guarded dispatch
 * decisions. The git mechanics of the composed legs (worktree-kind dispatch, the
 * merge-strategy-independent delete, prune) are exercised end-to-end with real git
 * in the integration tier; here the index and git seams are spied so the
 * orchestration is asserted in isolation.
 */

import { describe, it, expect } from "vitest";

import {
  runBranchTeardown,
  runTeardown,
  type TeardownContext,
} from "../../../../src/lib/work-unit/verbs/teardown.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import type { LifecycleIndexFs, DirEntry } from "../../../../src/lib/work-unit/lifecycle-index.js";

const CWD = "/repo";

interface MetaSpec {
  slug: string;
  /** Lifecycle tier directory under `.arc/` (e.g. `active`, `completed`). */
  tier: string;
  state: string;
  /** Optional nested subdir under the tier. */
  subdir?: string;
}

/** Build an injectable index fs over a fixed set of metas (absolute-path keyed). */
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
    const dirAbs = meta.subdir === undefined ? tierAbs : `${tierAbs}/${meta.subdir}`;
    const filename = `meta-${meta.slug}.md`;
    if (meta.subdir !== undefined) {
      const segments = meta.subdir.split("/");
      let parent = tierAbs;
      for (const seg of segments) {
        addChildDir(parent, seg);
        parent = `${parent}/${seg}`;
      }
    }
    ensureDir(dirAbs).push({ name: filename, isDirectory: () => false });
    files.set(
      `${dirAbs}/${filename}`,
      `# Metadata: ${meta.slug}\n\n` +
        `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
        `|-----------|-----------|------------|-----------|--------------|\n` +
        `| \`${meta.state}\` | \`andrew\` | \`[none]\` | \`Novel\` | \`P1\` |\n\n---\n`,
    );
  }

  return {
    readdir: (path) => {
      const entries = dirs.get(path);
      if (entries === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
      return Promise.resolve(entries);
    },
    readFile: (path) => {
      const content = files.get(path);
      if (content === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
      return Promise.resolve(content);
    },
  };
}

const SHIPPED_META: MetaSpec = { slug: "demo", tier: "completed", state: "Shipped", subdir: "2026-q2/01_demo" };
const ACTIVE_META: MetaSpec = { slug: "demo", tier: "active", state: "Active" };
/** A parked origin — `Active` phase, `backlog/planned/` location (the `park@Planning` shelf). */
const PARKED_META: MetaSpec = { slug: "demo", tier: "backlog", state: "Active", subdir: "planned/demo" };

/** A configurable git exec spy. Routes by command; records calls. */
interface ExecOptions {
  /** Branches `for-each-ref` reports. */
  branches?: string[];
  /** `git worktree list --porcelain` body. */
  worktreePorcelain?: string;
  /** Whether the branch still exists after a delete attempt (drives `branchDeleted`). */
  branchSurvivesDelete?: boolean;
  /** Whether the local `git branch -D` throws (simulates a force-delete failure). */
  branchDeleteThrows?: boolean;
}

function buildExec(opts: ExecOptions = {}): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const branches = opts.branches ?? [];
  const deletedBranches = new Set<string>();
  const exec: GitExec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const sub = args[0];
    if (sub === "for-each-ref") return { stdout: branches.join("\n") + "\n" };
    if (sub === "worktree" && args[1] === "list") return { stdout: opts.worktreePorcelain ?? "" };
    if (sub === "rev-parse") return { stdout: "deadbeef\n" };
    if (sub === "rev-list") return { stdout: "" }; // contained → safe
    if (sub === "branch" && args[1] === "-D") {
      if (opts.branchDeleteThrows) throw new Error("git branch -D failed");
      const deleted = args[2];
      if (deleted !== undefined) deletedBranches.add(deleted);
      return { stdout: "" };
    }
    if (sub === "show-ref") {
      if (opts.branchSurvivesDelete) return { stdout: "" };
      const ref = args[args.length - 1];
      const branch = ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : undefined;
      if (branch !== undefined && branches.includes(branch) && !deletedBranches.has(branch)) {
        return { stdout: "" };
      }
      throw new Error("not found"); // ref gone → deleted
    }
    if (sub === "fetch") return { stdout: "" };
    if (sub === "status") return { stdout: "" }; // clean worktree
    return { stdout: "" };
  };
  return { exec, calls };
}

function buildCtx(metas: MetaSpec[], execOpts?: ExecOptions): { ctx: TeardownContext; calls: string[][] } {
  const { exec, calls } = buildExec(execOpts);
  return {
    ctx: { cwd: CWD, exec, indexFs: buildIndexFs(metas), chdir: () => {} },
    calls,
  };
}

describe("runTeardown — arc-state authority gate", () => {
  it("authorizes a `completed/` WU (location, not git)", async () => {
    const { ctx } = buildCtx([SHIPPED_META], { branches: [] });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
  });

  it("refuses an `active/` WU that has not shipped — no git touched", async () => {
    const { ctx, calls } = buildCtx([ACTIVE_META]);

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/not shipped|completed/i);
    // The gate refused before any git invocation.
    expect(calls).toEqual([]);
  });

  it("refuses a nonexistent WU", async () => {
    const { ctx } = buildCtx([], { branches: [] });

    const result = await runTeardown(ctx, { name: "ghost", base: "main" });

    expect(result.status).toBe("rejected");
  });
});

describe("runTeardown — branch resolution", () => {
  it("resolves the WU branch by slug regardless of type prefix and reaps it", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["main", "feat/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branch).toBe("feat/demo");
    expect(result.branchDeleted).toBe(true);
    expect(calls).toContainEqual(["git", "branch", "-D", "feat/demo"]);
  });

  it("is a no-op on the branch arm when no local branch maps (already reaped), still prunes", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["main"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branch).toBeNull();
    expect(result.branchDeleted).toBe(false);
    expect(calls.some((c) => c[1] === "branch" && c[2] === "-D")).toBe(false);
    // Prune still runs (cleans any lingering tracking refs).
    expect(calls).toContainEqual(["git", "fetch", "--prune", "origin"]);
  });

  it("refuses when more than one local branch maps to the slug (ambiguous)", async () => {
    const { ctx } = buildCtx([SHIPPED_META], { branches: ["feat/demo", "fix/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/multiple local branches|ambiguous|resolve manually/i);
  });

  it("surfaces a push-state refusal (branch left intact) without dropping the WU", async () => {
    // `show-ref` reports the branch still present after the merged-safe delete →
    // the push-state gate refused (ahead of / no upstream); surface, don't fail.
    const { ctx } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      branchSurvivesDelete: true,
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branchDeleted).toBe(false);
    expect(result.notices.some((n) => /left intact/i.test(n))).toBe(true);
  });
});

describe("runTeardown — worktree dispatch (presence guard)", () => {
  const PRIMARY_PORCELAIN = "worktree /repo\nHEAD abc\nbranch refs/heads/main\n";

  it("in-place arm: branch lives in the primary worktree → relocate to base, no worktree removal", async () => {
    const porcelain =
      "worktree /repo\nHEAD abc\nbranch refs/heads/feat/demo\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: porcelain,
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    // The branch maps to the primary worktree → no distinct worktree to remove,
    // but the primary must be switched off the branch before the delete.
    expect(result.worktreeRemoved).toBeNull();
    expect(calls.some((c) => c[1] === "worktree" && c[2] === "remove")).toBe(false);
    expect(calls).toContainEqual(["git", "switch", "main"]);
    // The relocation precedes the branch delete (a checked-out branch can't be deleted).
    const switchIdx = calls.findIndex((c) => c[1] === "switch");
    const deleteIdx = calls.findIndex((c) => c[1] === "branch" && c[2] === "-D");
    expect(switchIdx).toBeLessThan(deleteIdx);
    // The refreshed remote base is fast-forwarded into the local base after the switch.
    expect(calls).toContainEqual(["git", "merge", "--ff-only", "origin/main"]);
    expect(result.notices.some((n) => /relocated the primary worktree/i.test(n))).toBe(true);
  });

  it("linked arm: branch lives in a distinct worktree → that worktree is removed", async () => {
    const porcelain =
      PRIMARY_PORCELAIN +
      "\nworktree /repo-feat-demo\nHEAD def\nbranch refs/heads/feat/demo\n";
    const { ctx, calls } = buildCtx([SHIPPED_META], {
      branches: ["feat/demo"],
      worktreePorcelain: porcelain,
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.worktreeRemoved).toBe("/repo-feat-demo");
    expect(calls).toContainEqual(["git", "worktree", "remove", "/repo-feat-demo"]);
    // Worktree removal precedes the branch delete (a checked-out branch can't be deleted).
    const removeIdx = calls.findIndex((c) => c[1] === "worktree" && c[2] === "remove");
    const deleteIdx = calls.findIndex((c) => c[1] === "branch" && c[2] === "-D");
    expect(removeIdx).toBeLessThan(deleteIdx);
  });
});

describe("runTeardown — base refresh before the reap-safety check", () => {
  it("fetches `origin/<base>` before the merged-safe delete (order-independent reap)", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["feat/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main" });

    expect(result.status).toBe("torn-down");
    // The base is refreshed (fetch `origin main`) ahead of the containment-gated
    // delete, so a stale local base can't false-negative a merged branch.
    const fetchIdx = calls.findIndex(
      (c) => c[1] === "fetch" && c[2] === "origin" && c[3] === "main",
    );
    const deleteIdx = calls.findIndex((c) => c[1] === "branch" && c[2] === "-D");
    expect(fetchIdx).toBeGreaterThanOrEqual(0);
    expect(fetchIdx).toBeLessThan(deleteIdx);
  });
});

describe("runTeardown — abandoned mode (un-shipped / force)", () => {
  const PRIMARY_PORCELAIN = "worktree /repo\nHEAD abc\nbranch refs/heads/main\n";

  it("accepts a parked (`backlog/planned/`) origin — un-shipped arc-state", async () => {
    const { ctx } = buildCtx([PARKED_META], { branches: ["plan/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("torn-down");
  });

  it("accepts a retired (removed → nonexistent) origin — no meta on disk", async () => {
    const { ctx } = buildCtx([], { branches: ["plan/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("torn-down");
  });

  it("refuses a shipped (`completed/`) WU — the force path is not for the merged case", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["feat/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/shipped|merged-safe|completed/i);
    // The gate refused before any git invocation.
    expect(calls).toEqual([]);
  });

  it("force-deletes the unmerged branch (local + remote), bypassing the containment check", async () => {
    const { ctx, calls } = buildCtx([], { branches: ["plan/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branch).toBe("plan/demo");
    expect(result.branchDeleted).toBe(true);
    expect(calls).toContainEqual(["git", "branch", "-D", "plan/demo"]);
    // Full retirement: the remote ref is deleted too (the merged-safe path never does this).
    expect(calls).toContainEqual(["git", "push", "origin", "--delete", "plan/demo"]);
    // The containment oracle is the discriminator — the force path never consults it.
    expect(calls.some((c) => c[1] === "rev-list")).toBe(false);
    expect(calls.some((c) => c[1] === "cherry")).toBe(false);
  });

  it("rejects when the local force-delete fails and the branch survives — not a torn-down report", async () => {
    // The local `git branch -D` throws and the branch is still present afterward:
    // a force-mode failure, distinct from a best-effort remote-ref cleanup miss.
    const { ctx } = buildCtx([], {
      branches: ["plan/demo"],
      branchDeleteThrows: true,
      branchSurvivesDelete: true,
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/force-delete local branch/i);
  });

  it("degrades a remote-only delete failure to a notice when the local delete landed", async () => {
    // The local `git branch -D` succeeds (branch gone), but the remote `push
    // --delete` fails with an actionable error → a notice, still torn-down.
    const { ctx } = buildCtx([], { branches: ["plan/demo"] });
    const baseExec = ctx.exec;
    ctx.exec = async (cmd, args) => {
      if (args[0] === "push" && args.includes("--delete")) throw new Error("remote rejected: connection refused");
      return baseExec(cmd, args);
    };

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branchDeleted).toBe(true);
    expect(result.notices.some((n) => /remote branch/i.test(n))).toBe(true);
  });

  it("mode selection routes correctly: shipped uses the containment-gated delete, not force", async () => {
    const { ctx, calls } = buildCtx([SHIPPED_META], { branches: ["feat/demo"] });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "shipped" });

    expect(result.status).toBe("torn-down");
    // The merged-safe path consults containment and never force-deletes the remote ref.
    expect(calls.some((c) => c[1] === "rev-list" || c[1] === "cherry")).toBe(true);
    expect(calls.some((c) => c[1] === "push" && c.includes("--delete"))).toBe(false);
  });

  it("in-place arm under abandoned mode: switches the primary to base, no worktree removal", async () => {
    const porcelain = "worktree /repo\nHEAD abc\nbranch refs/heads/plan/demo\n";
    const { ctx, calls } = buildCtx([PARKED_META], {
      branches: ["plan/demo"],
      worktreePorcelain: porcelain,
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.worktreeRemoved).toBeNull();
    expect(calls.some((c) => c[1] === "worktree" && c[2] === "remove")).toBe(false);
    expect(calls).toContainEqual(["git", "switch", "main"]);
    // The relocation precedes the force-delete (a checked-out branch can't be deleted).
    const switchIdx = calls.findIndex((c) => c[1] === "switch");
    const deleteIdx = calls.findIndex((c) => c[1] === "branch" && c[2] === "-D");
    expect(switchIdx).toBeLessThan(deleteIdx);
  });

  it("linked arm under abandoned mode: tears down the worktree before the force-delete", async () => {
    const porcelain =
      PRIMARY_PORCELAIN +
      "\nworktree /repo-plan-demo\nHEAD def\nbranch refs/heads/plan/demo\n";
    const { ctx, calls } = buildCtx([PARKED_META], {
      branches: ["plan/demo"],
      worktreePorcelain: porcelain,
    });

    const result = await runTeardown(ctx, { name: "demo", base: "main", mode: "abandoned" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.worktreeRemoved).toBe("/repo-plan-demo");
    expect(calls).toContainEqual(["git", "worktree", "remove", "/repo-plan-demo"]);
    const removeIdx = calls.findIndex((c) => c[1] === "worktree" && c[2] === "remove");
    const deleteIdx = calls.findIndex((c) => c[1] === "branch" && c[2] === "-D");
    expect(removeIdx).toBeLessThan(deleteIdx);
  });
});

describe("runBranchTeardown — recordless cheap branches", () => {
  it("reaps an exact recordless chore branch without an arc-state gate", async () => {
    const { ctx, calls } = buildCtx([], { branches: ["chore/groom-demo"] });

    const result = await runBranchTeardown(ctx, { branch: "chore/groom-demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branch).toBe("chore/groom-demo");
    expect(result.branchDeleted).toBe(true);
    expect(calls).toContainEqual(["git", "branch", "-D", "chore/groom-demo"]);
    // No lifecycle-index gate: this path is for branch projections with no WU meta.
    expect(calls.some((c) => c[1] === "for-each-ref")).toBe(false);
  });

  it("is idempotent when the recordless branch is already absent", async () => {
    const { ctx, calls } = buildCtx([], { branches: [] });

    const result = await runBranchTeardown(ctx, { branch: "chore/groom-demo", base: "main" });

    expect(result.status).toBe("torn-down");
    if (result.status !== "torn-down") return;
    expect(result.branch).toBeNull();
    expect(result.branchDeleted).toBe(false);
    expect(calls.some((c) => c[1] === "branch" && c[2] === "-D")).toBe(false);
    expect(calls).toContainEqual(["git", "fetch", "--prune", "origin"]);
  });

  it("refuses non-chore branches so WU and errand records keep their authoritative teardown paths", async () => {
    const { ctx, calls } = buildCtx([], { branches: ["feat/demo"] });

    const result = await runBranchTeardown(ctx, { branch: "feat/demo", base: "main" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/chore\/<slug>|cheap branches/i);
    expect(calls).toEqual([]);
  });
});
