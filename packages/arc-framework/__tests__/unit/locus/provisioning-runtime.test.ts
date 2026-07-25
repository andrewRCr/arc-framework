/** Production provisioning adapter contracts over real exact-generation storage. */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { createNodeProvisioningDependencies } from "../../../src/lib/locus/provisioning-runtime.js";
import { PrimaryCheckoutResidueError } from "../../../src/lib/locus/provisioning-types.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("node provisioning runtime", () => {
  it("acquires the checkout-derived lock and revalidates a clean primary target", async () => {
    const primary = await mkdtemp(join(tmpdir(), "arc-provision-runtime-"));
    roots.push(primary);
    const head = "a".repeat(40);
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "worktree") {
        return { stdout: `worktree ${primary}\0HEAD ${head}\0branch refs/heads/main\0\0` };
      }
      if (args[0] === "status") return { stdout: "" };
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "main\n" };
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };
    const runtime = createNodeProvisioningDependencies({
      exec,
      identity: "andrew",
      anchor: {
        kind: "process",
        pid: 42,
        startToken: "start",
        inspector: "fixture",
        selector: "codex",
      },
      inspector: { kind: "fixture", inspect: async () => ({ kind: "absent" }) },
      pathFlavor: "posix",
      base: "main",
      branch: "chore/sample",
      postCreateScript: "",
      registeredHarnessDirs: "",
    });

    const acquired = await runtime.acquireRecordLock(primary);
    expect(acquired.kind).toBe("acquired");
    if (acquired.kind !== "acquired") throw new Error("fixture lock failed");
    await expect(runtime.revalidateTarget({
      proposal: {
        kind: "proposal",
        allocation: { kind: "primary", checkoutPath: primary },
        subject: { kind: "errand", key: "sample", claimId: "c".repeat(32) },
      },
      checkoutPath: primary,
      handle: acquired.handle,
    })).resolves.toEqual({ kind: "ready" });
    await expect(runtime.releaseRecordLock(acquired.handle)).resolves.toBeUndefined();
  });

  const HEAD = "a".repeat(40);

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
      identity: "andrew",
      anchor: { kind: "process", pid: 42, startToken: "start", inspector: "fixture", selector: "codex" },
      inspector: { kind: "fixture", inspect: async () => ({ kind: "absent" }) },
      pathFlavor: "posix",
      base: "main",
      branch: "chore/sample",
      postCreateScript: "",
      registeredHarnessDirs: "",
    });
  }

  describe("primary checkout rollback", () => {
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
