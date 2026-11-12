import { describe, it, expect } from "vitest";

import {
  reconcileBranch,
  type ReconcileBranchContext,
} from "../../../../src/lib/work-unit/mutators/reconcile-branch.js";

/**
 * Build a {@link ReconcileBranchContext} recording every git invocation's args.
 * `failArg0` names a git subcommand (e.g. `push`) whose invocation should reject;
 * `failError` is the rejection value (defaulting to a generic failure) — pass a
 * git-shaped error carrying `stderr` to exercise the benign-vs-actionable split.
 */
function buildCtx(
  failArg0?: string,
  failError?: unknown,
  stdoutByArg0?: (args: string[]) => string,
): { ctx: ReconcileBranchContext; calls: string[][] } {
  const calls: string[][] = [];
  const ctx: ReconcileBranchContext = {
    exec: async (cmd, args) => {
      calls.push([cmd, ...args]);
      if (failArg0 !== undefined && args[0] === failArg0) {
        throw failError ?? new Error(`git ${args.join(" ")} failed`);
      }
      return { stdout: stdoutByArg0?.(args) ?? "" };
    },
  };
  return { ctx, calls };
}

describe("reconcileBranch", () => {
  it("rotates plan/ → <type>/ at activate (local rename)", async () => {
    const { ctx, calls } = buildCtx(undefined, undefined, (args) =>
      args[0] === "for-each-ref" ? "refs/remotes/origin/plan/demo-wu\n" : "",
    );

    await reconcileBranch(ctx, {
      mutation: "rename",
      branch: "plan/demo-wu",
      toBranch: "feat/demo-wu",
    });

    expect(calls).toEqual([
      ["git", "branch", "-m", "plan/demo-wu", "feat/demo-wu"],
      ["git", "for-each-ref", "--format=%(upstream)", "refs/heads/feat/demo-wu"],
      ["git", "branch", "--unset-upstream", "feat/demo-wu"],
    ]);
  });

  it("rotates an untracked branch when there is no inherited upstream to clear", async () => {
    const { ctx, calls } = buildCtx();

    await expect(
      reconcileBranch(ctx, {
        mutation: "rename",
        branch: "plan/demo-wu",
        toBranch: "feat/demo-wu",
      }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      ["git", "branch", "-m", "plan/demo-wu", "feat/demo-wu"],
      ["git", "for-each-ref", "--format=%(upstream)", "refs/heads/feat/demo-wu"],
    ]);
  });

  it("skips a same-name rename", async () => {
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, {
      mutation: "rename",
      branch: "fix/demo-wu",
      toBranch: "fix/demo-wu",
    });

    expect(calls).toEqual([]);
  });

  it("preserves the branch at park@Active (no git invocation)", async () => {
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, { mutation: "preserve" });

    expect(calls).toEqual([]);
  });

  it("merged-safe delete removes the local branch when contained in upstream (base check not consulted)", async () => {
    // rev-parse verifies the upstream exists; rev-list empty → contained → safe.
    // No cherry: the upstream fast-path short-circuits. Local-only: no remote push.
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, { mutation: "delete-merged", branch: "feat/demo-wu", base: "main" });

    expect(calls).toEqual([
      ["git", "rev-parse", "--verify", "--quiet", "origin/feat/demo-wu"],
      ["git", "rev-list", "feat/demo-wu", "^origin/feat/demo-wu"],
      ["git", "branch", "-D", "feat/demo-wu"],
    ]);
  });

  it("merged-safe delete reaps a no-upstream branch that has landed in base (pruned ref, merged)", async () => {
    // rev-parse rejects (delete-on-merge pruned the tracking ref); cherry shows
    // all '-' → every commit patch-present in base → safe. The fault-(B) fix.
    const { ctx, calls } = buildCtx("rev-parse", undefined, (args) =>
      args[0] === "cherry" ? "- abc123\n" : "",
    );

    await reconcileBranch(ctx, { mutation: "delete-merged", branch: "feat/demo-wu", base: "main" });

    expect(calls).toEqual([
      ["git", "rev-parse", "--verify", "--quiet", "origin/feat/demo-wu"],
      ["git", "cherry", "main", "feat/demo-wu"],
      ["git", "branch", "-D", "feat/demo-wu"],
    ]);
  });

  it("merged-safe delete reaps when ahead of upstream but landed in base (rebase / squash)", async () => {
    // Upstream exists but stale (rev-list non-empty → not contained); cherry shows
    // the rewritten commits are patch-present in base → safe.
    const { ctx, calls } = buildCtx(undefined, undefined, (args) => {
      if (args[0] === "rev-list") return "abc123\n";
      if (args[0] === "cherry") return "- abc123\n";
      return "";
    });

    await reconcileBranch(ctx, { mutation: "delete-merged", branch: "feat/demo-wu", base: "main" });

    expect(calls).toContainEqual(["git", "cherry", "main", "feat/demo-wu"]);
    expect(calls).toContainEqual(["git", "branch", "-D", "feat/demo-wu"]);
  });

  it("merged-safe delete refuses when ahead of upstream and not landed in base", async () => {
    // Not contained in upstream (rev-list non-empty) and not landed (cherry '+').
    const { ctx, calls } = buildCtx(undefined, undefined, (args) => {
      if (args[0] === "rev-list") return "abc123\ndef456\n";
      if (args[0] === "cherry") return "+ abc123\n";
      return "";
    });

    await reconcileBranch(ctx, { mutation: "delete-merged", branch: "feat/demo-wu", base: "main" });

    expect(calls).toEqual([
      ["git", "rev-parse", "--verify", "--quiet", "origin/feat/demo-wu"],
      ["git", "rev-list", "feat/demo-wu", "^origin/feat/demo-wu"],
      ["git", "cherry", "main", "feat/demo-wu"],
    ]);
    expect(calls).not.toContainEqual(["git", "branch", "-D", "feat/demo-wu"]);
  });

  it("merged-safe delete refuses a no-upstream branch also not landed in base (unpushed, unmerged)", async () => {
    // rev-parse rejects (no tracking ref) and cherry shows a '+' → unprovable → refuse.
    const { ctx, calls } = buildCtx("rev-parse", undefined, (args) =>
      args[0] === "cherry" ? "+ abc123\n" : "",
    );

    await expect(
      reconcileBranch(ctx, { mutation: "delete-merged", branch: "plan/demo-wu", base: "main" }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      ["git", "rev-parse", "--verify", "--quiet", "origin/plan/demo-wu"],
      ["git", "cherry", "main", "plan/demo-wu"],
    ]);
    expect(calls).not.toContainEqual(["git", "branch", "-D", "plan/demo-wu"]);
  });

  it("merged-safe delete honors an explicit remote for the upstream containment", async () => {
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, {
      mutation: "delete-merged",
      branch: "feat/demo-wu",
      base: "main",
      remote: "upstream",
    });

    expect(calls).toEqual([
      ["git", "rev-parse", "--verify", "--quiet", "upstream/feat/demo-wu"],
      ["git", "rev-list", "feat/demo-wu", "^upstream/feat/demo-wu"],
      ["git", "branch", "-D", "feat/demo-wu"],
    ]);
  });

  it("makes no git invocation for create (reconcile-work-unit-worktree owns branch creation)", async () => {
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, { mutation: "create" });

    expect(calls).toEqual([]);
  });
});
