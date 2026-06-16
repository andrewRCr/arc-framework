import { describe, it, expect } from "vitest";

import {
  reconcileBranch,
  type ReconcileBranchContext,
} from "../../../../src/lib/work-unit/mutators/reconcile-branch.js";

/**
 * Build a {@link ReconcileBranchContext} recording every git invocation's args.
 * `failArg0` names a git subcommand (e.g. `push`) whose invocation should reject,
 * simulating a remote branch that was never pushed.
 */
function buildCtx(failArg0?: string): { ctx: ReconcileBranchContext; calls: string[][] } {
  const calls: string[][] = [];
  const ctx: ReconcileBranchContext = {
    exec: async (cmd, args) => {
      calls.push([cmd, ...args]);
      if (failArg0 !== undefined && args[0] === failArg0) {
        throw new Error(`git ${args.join(" ")} failed`);
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
    const { ctx, calls } = buildCtx("push");

    // An unpushed planning branch has no remote ref — the remote delete rejects,
    // but the local teardown is authoritative and the leg must resolve.
    await expect(
      reconcileBranch(ctx, { mutation: "delete", branch: "plan/demo-wu" }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      ["git", "branch", "-D", "plan/demo-wu"],
      ["git", "push", "origin", "--delete", "plan/demo-wu"],
    ]);
  });

  it("stays inert for a spawn-backed create (the worktree-spawn leg owns branch creation)", async () => {
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, { mutation: "create" });

    expect(calls).toEqual([]);
  });

  it("cuts the branch in the current worktree for an in-place create (git checkout -b)", async () => {
    const { ctx, calls } = buildCtx();

    await reconcileBranch(ctx, { mutation: "create", inPlace: { branch: "plan/demo-wu" } });

    expect(calls).toEqual([["git", "checkout", "-b", "plan/demo-wu"]]);
  });
});
