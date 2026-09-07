/** Production provisioning adapter contracts over real exact-generation storage. */

import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import type { BaseSyncResult } from "../../../src/lib/git/base-sync.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { createNodeProvisioningDependencies } from "../../../src/lib/locus/provisioning-runtime.js";
import { PrimaryCheckoutResidueError } from "../../../src/lib/locus/provisioning-types.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("node provisioning runtime", () => {
  const HEAD = "a".repeat(40);

  function spawnedRuntime(exec: GitExec) {
    return createNodeProvisioningDependencies({
      exec,
      base: "main",
      branch: "chore/sample",
      postCreateScript: "",
      registeredHarnessDirs: "",
    });
  }

  describe("spawned rollback", () => {
    const receipt = {
      worktreePath: "/work/sample",
      branch: "chore/sample",
      worktreeCreated: true as const,
      branchCreated: true,
      base: "main",
    };

    it("pins topology and destructive Git operations to the resolved primary", async () => {
      const calls: Array<{ args: string[]; cwd: string | undefined }> = [];
      const exec: GitExec = async (_command, args, options) => {
        calls.push({ args: [...args], cwd: options?.cwd });
        if (args[0] === "worktree" && args[1] === "list") {
          return {
            stdout: `worktree /repo\0HEAD ${HEAD}\0branch refs/heads/main\0\0`
              + `worktree ${receipt.worktreePath}\0HEAD ${HEAD}\0branch refs/heads/${receipt.branch}\0\0`,
          };
        }
        return { stdout: "" };
      };

      await expect(spawnedRuntime(exec).rollbackSpawned(receipt, HEAD, "/repo"))
        .resolves.toEqual({ kind: "rolled-back" });
      expect(calls.map((call) => call.args)).toEqual([
        ["worktree", "list", "--porcelain", "-z"],
        ["worktree", "remove", receipt.worktreePath],
        ["branch", "-D", receipt.branch],
      ]);
      expect(calls.every((call) => call.cwd === "/repo")).toBe(true);
    });

    it("refuses rollback when the registered checkout generation changed", async () => {
      const calls: Array<{ args: string[]; cwd: string | undefined }> = [];
      const changedHead = "b".repeat(40);
      const exec: GitExec = async (_command, args, options) => {
        calls.push({ args: [...args], cwd: options?.cwd });
        return {
          stdout: `worktree /repo\0HEAD ${HEAD}\0branch refs/heads/main\0\0`
            + `worktree ${receipt.worktreePath}\0HEAD ${changedHead}\0branch refs/heads/${receipt.branch}\0\0`,
        };
      };

      await expect(spawnedRuntime(exec).rollbackSpawned(receipt, HEAD, "/repo"))
        .resolves.toEqual({ kind: "generation-mismatch" });
      expect(calls).toEqual([{
        args: ["worktree", "list", "--porcelain", "-z"],
        cwd: "/repo",
      }]);
    });
  });

  /**
   * A primary checkout whose git calls can be failed after the mutating checkout lands.
   *
   * `probe` fails the head read that follows the mutation; `restore` fails the compensating
   * checkout back to the previous branch. Both only fire post-mutation, so the pre-mutation reads
   * that establish the receipt's coordinates behave normally.
   */
  function primaryRuntime(
    state: { branch: string; head: string },
    calls: string[][],
    failures: { probe?: boolean; restore?: boolean } = {},
    synchronizePrimaryBase?: () => Promise<BaseSyncResult>,
  ) {
    let mutated = false;
    const exec: GitExec = async (_command, args) => {
      calls.push([...args]);
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: `${state.branch}\n` };
      if (args[0] === "rev-parse") {
        if (mutated && failures.probe === true) throw new Error("fatal: ambiguous argument 'HEAD'");
        return { stdout: `${state.head}\n` };
      }
      if (args[0] === "checkout" && args[1] === "-b") {
        state.branch = args[2] ?? "";
        mutated = true;
        return { stdout: "" };
      }
      if (args[0] === "checkout") {
        if (mutated && failures.restore === true) throw new Error("fatal: cannot switch branches");
        state.branch = args[1] ?? "";
        mutated = true;
        return { stdout: "" };
      }
      if (args[0] === "branch") return { stdout: "" };
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };
    return createNodeProvisioningDependencies({
      exec,
      base: "main",
      branch: "chore/sample",
      ...(synchronizePrimaryBase === undefined ? {} : { synchronizePrimaryBase }),
      postCreateScript: "",
      registeredHarnessDirs: "",
    });
  }

  describe("primary checkout rollback", () => {
    it("cuts a new branch from a local-ahead base when there is nothing to pull", async () => {
      const state = { branch: "main", head: HEAD };
      const calls: string[][] = [];
      const runtime = primaryRuntime(state, calls, {}, async () => ({
        status: "refused",
        reason: "local-ahead",
        base: "main",
      }));

      await expect(runtime.checkoutPrimary("/repo", "chore/sample", null))
        .resolves.toMatchObject({ branchCreated: true, head: HEAD });
      expect(state.branch).toBe("chore/sample");
    });

    it("still refuses a new branch when base synchronization fails", async () => {
      const state = { branch: "main", head: HEAD };
      const calls: string[][] = [];
      const runtime = primaryRuntime(state, calls, {}, async () => ({
        status: "refused",
        reason: "fetch-failed",
        base: "main",
      }));

      await expect(runtime.checkoutPrimary("/repo", "chore/sample", null))
        .rejects.toThrow("Primary base synchronization refused (fetch-failed)");
      expect(state.branch).toBe("main");
    });

    it("refuses a null-branch checkout when the pinned base head changed", async () => {
      const state = { branch: "main", head: HEAD };
      const calls: string[][] = [];
      const runtime = primaryRuntime(state, calls);

      await expect(runtime.checkoutPrimary("/repo", null, "b".repeat(40)))
        .rejects.toThrow("Primary checkout does not match the expected pinned base head");
      expect(state.branch).toBe("main");
      expect(calls).toEqual([
        ["rev-parse", "--abbrev-ref", "HEAD"],
        ["rev-parse", "HEAD"],
      ]);
    });

    it("restores the previous branch and deletes the branch it created", async () => {
      const state = { branch: "main", head: HEAD };
      const calls: string[][] = [];
      const runtime = primaryRuntime(state, calls);

      const receipt = await runtime.checkoutPrimary("/repo", "chore/sample", null);
      await expect(runtime.rollbackPrimary("/repo", receipt)).resolves.toEqual({ kind: "rolled-back" });

      expect(calls).toContainEqual(["branch", "-D", "chore/sample"]);
      expect(state.branch).toBe("main");
    });

    it("refuses to delete a branch it did not create when another checkout shares the head", async () => {
      const state = { branch: "main", head: HEAD };
      const calls: string[][] = [];
      const runtime = primaryRuntime(state, calls);

      const receipt = await runtime.checkoutPrimary("/repo", "chore/sample", null);
      // A concurrent session moves the primary onto an unrelated branch at the same commit.
      state.branch = "feat/someone-else";
      const rolledBack = await runtime.rollbackPrimary("/repo", receipt);

      expect(rolledBack).toEqual({ kind: "generation-mismatch" });
      expect(calls.filter((call) => call[0] === "branch")).toEqual([]);
      expect(state.branch).toBe("feat/someone-else");
    });
  });

  describe("post-mutation probe failure", () => {
    it("undoes the branch it created when the head probe fails", async () => {
      const state = { branch: "main", head: HEAD };
      const calls: string[][] = [];
      const runtime = primaryRuntime(state, calls, { probe: true });

      await expect(runtime.checkoutPrimary("/repo", "chore/sample", null))
        .rejects.toThrow("fatal: ambiguous argument 'HEAD'");

      expect(state.branch).toBe("main");
      expect(calls).toContainEqual(["branch", "-D", "chore/sample"]);
    });

    it("restores the previous branch without deleting a retained branch it reused", async () => {
      const state = { branch: "main", head: HEAD };
      const calls: string[][] = [];
      const runtime = primaryRuntime(state, calls, { probe: true });

      await expect(runtime.checkoutPrimary("/repo", "chore/sample", HEAD))
        .rejects.toThrow("fatal: ambiguous argument 'HEAD'");

      expect(state.branch).toBe("main");
      expect(calls.filter((call) => call[0] === "branch")).toEqual([]);
    });

    it("reports the residue when the compensating checkout also fails", async () => {
      const state = { branch: "main", head: HEAD };
      const calls: string[][] = [];
      const runtime = primaryRuntime(state, calls, { probe: true, restore: true });

      await expect(runtime.checkoutPrimary("/repo", "chore/sample", null))
        .rejects.toThrow(PrimaryCheckoutResidueError);

      // The mutation stands: the primary is still on the created branch, which is exactly what the
      // caller must learn, since it holds no receipt to roll back with.
      expect(state.branch).toBe("chore/sample");
    });
  });
});
