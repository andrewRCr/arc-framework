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
): { ctx: ReconcileBranchContext; calls: string[][] } {
  const calls: string[][] = [];
  const ctx: ReconcileBranchContext = {
    exec: async (cmd, args) => {
      calls.push([cmd, ...args]);
      if (failArg0 !== undefined && args[0] === failArg0) {
        throw failError ?? new Error(`git ${args.join(" ")} failed`);
      }
      return { stdout: "" };
    },
  };
  return { ctx, calls };
}

describe("reconcileBranch", () => {
  it("rotates plan/ → <type>/ at activate (local rename)", async () => {
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, {
      mutation: "rename",
      branch: "plan/demo-wu",
      toBranch: "feat/demo-wu",
    });

    expect(calls).toEqual([["git", "branch", "-m", "plan/demo-wu", "feat/demo-wu"]]);
  });

  it("preserves the branch at park@Active (no git invocation)", async () => {
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, { mutation: "preserve" });

    expect(calls).toEqual([]);
  });

  it("tears down the branch local + remote at park@Planning / pre-merge abandon", async () => {
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, { mutation: "delete", branch: "plan/demo-wu" });

    expect(calls).toEqual([
      ["git", "branch", "-D", "plan/demo-wu"],
      ["git", "push", "origin", "--delete", "plan/demo-wu"],
    ]);
  });

  it("tears down against an explicit remote", async () => {
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, { mutation: "delete", branch: "feat/demo-wu", remote: "upstream" });

    expect(calls).toEqual([
      ["git", "branch", "-D", "feat/demo-wu"],
      ["git", "push", "upstream", "--delete", "feat/demo-wu"],
    ]);
  });

  it("swallows a remote-delete failure for an unpushed branch (local teardown still lands)", async () => {
    const { ctx, calls } = buildCtx(
      "push",
      Object.assign(new Error("git push failed"), {
        stderr: "error: unable to delete 'plan/demo-wu': remote ref does not exist",
      }),
    );

    // An unpushed planning branch has no remote ref — the remote delete rejects
    // with the benign "remote ref does not exist", but the local teardown is
    // authoritative and the leg must resolve.
    await expect(
      reconcileBranch(ctx, { mutation: "delete", branch: "plan/demo-wu" }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      ["git", "branch", "-D", "plan/demo-wu"],
      ["git", "push", "origin", "--delete", "plan/demo-wu"],
    ]);
  });

  it("propagates an actionable remote-delete failure (auth) instead of masking it", async () => {
    const { ctx, calls } = buildCtx(
      "push",
      Object.assign(
        new Error(
          "Command failed: git push origin --delete feat/demo-wu\n" +
            "fatal: Authentication failed for 'https://example.com/repo.git'",
        ),
        { stderr: "fatal: Authentication failed for 'https://example.com/repo.git'" },
      ),
    );

    // A non-benign failure (auth / connectivity) must surface so the executor can
    // report partial application rather than silently orphaning a remote branch.
    await expect(
      reconcileBranch(ctx, { mutation: "delete", branch: "feat/demo-wu" }),
    ).rejects.toThrow(/authentication/i);

    // The local force-delete already landed; the remote delete was attempted.
    expect(calls).toEqual([
      ["git", "branch", "-D", "feat/demo-wu"],
      ["git", "push", "origin", "--delete", "feat/demo-wu"],
    ]);
  });

  it("makes no git invocation for create (reconcile-worktree owns branch creation)", async () => {
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, { mutation: "create" });

    expect(calls).toEqual([]);
  });
});
