/** Exact branch preservation required before ordinary Errand abandonment. */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeGitProcessError, scriptGitExec } from "../../helpers/git-exec-fake.js";
import {
  deleteAbandonedBranchAtExactBase,
  proveOrdinaryErrandAbandonmentPreservation,
  reapZeroDeltaBranch,
  settleAbandonBranchLease,
} from "../../../src/lib/errand/abandon-runtime.js";
import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import type { GitExec, GitExecInput } from "../../../src/lib/git/exec.js";

const HEAD = "a".repeat(40);

function gitError(command: string, args: readonly string[], message: string, exitCode: number) {
  return makeGitProcessError({ command, args, exitCode, stderr: message });
}

function paused(savedHead = HEAD): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    slug: "discard",
    claimId: "c".repeat(32),
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: "discard",
    branch: "chore/discard",
    origin: "description",
    originEntry: null,
    state: "paused",
    savedHead,
    changeRequest: null,
  }) as OrdinaryErrandRecord;
}

describe("proveOrdinaryErrandAbandonmentPreservation", () => {
  it("accepts the exact branch head when configured base already preserves it", async () => {
    const { exec } = scriptGitExec([
      { match: ["rev-parse", "--verify", "refs/heads/chore/discard^{commit}"],
        responses: [{ stdout: `${HEAD}\n`, stderr: "" }] },
      { match: ["merge-base", "--is-ancestor", HEAD, "main"],
        responses: [{ stdout: "", stderr: "" }] },
    ]);

    await expect(proveOrdinaryErrandAbandonmentPreservation(exec, "main", paused()))
      .resolves.toEqual({ kind: "ready", head: HEAD });
  });

  it("refuses a missing branch and a branch moved from its recorded head", async () => {
    const missing: GitExec = async (command, args) => {
      throw gitError(command, args, "unknown revision", 128);
    };
    await expect(proveOrdinaryErrandAbandonmentPreservation(missing, "main", paused()))
      .resolves.toMatchObject({ kind: "refused", reason: "preservation-unproven" });

    const moved: GitExec = async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: `${"b".repeat(40)}\n`, stderr: "" };
      throw new Error(`Unexpected git operation: ${args.join(" ")}`);
    };
    await expect(proveOrdinaryErrandAbandonmentPreservation(moved, "main", paused()))
      .resolves.toMatchObject({ kind: "refused", reason: "preservation-unproven" });
  });

  it("accepts a head preserved on the configured remote when base does not contain it", async () => {
    const { exec } = scriptGitExec([
      { match: ["rev-parse", "--verify", "refs/heads/chore/discard^{commit}"],
        responses: [{ stdout: `${HEAD}\n`, stderr: "" }] },
      { match: ["merge-base", "--is-ancestor", HEAD, "main"],
        responses: [{ failure: { exitCode: 1, stderr: "not an ancestor" } }] },
      { match: ["remote", "get-url", "origin"],
        responses: [{ stdout: "git@github.com:owner/repo.git\n", stderr: "" }] },
      { match: ["check-ref-format", "--branch", "chore/discard"],
        responses: [{ stdout: "", stderr: "" }] },
      { match: ["rev-parse", "--verify", "--end-of-options", "refs/heads/chore/discard^{commit}"],
        responses: [{ stdout: `${HEAD}\n`, stderr: "" }] },
      { match: { predicate: (args) => args[0] === "fetch" && args[1] === "--"
        && args[2] === "origin"
        && args[3]?.startsWith("+refs/heads/chore/discard:refs/arc/tmp/errand-pause/") === true },
      responses: [{ stdout: "", stderr: "" }] },
      { match: { predicate: (args) => args[0] === "rev-parse" && args[1] === "--verify"
        && args[2] === "--end-of-options"
        && args[3]?.startsWith("refs/arc/tmp/errand-pause/") === true },
      responses: [{ stdout: `${HEAD}\n`, stderr: "" }] },
      { match: ["merge-base", "--is-ancestor", HEAD, HEAD], responses: [{ stdout: "", stderr: "" }] },
      { match: { predicate: (args) => args[0] === "update-ref" && args[1] === "-d"
        && args[2]?.startsWith("refs/arc/tmp/errand-pause/") === true },
      responses: [{ stdout: "", stderr: "" }] },
    ]);

    await expect(proveOrdinaryErrandAbandonmentPreservation(exec, "main", paused()))
      .resolves.toEqual({ kind: "ready", head: HEAD });
  });

  it("returns an error when the base-containment probe itself fails", async () => {
    const { exec } = scriptGitExec([
      { match: ["rev-parse", "--verify", "refs/heads/chore/discard^{commit}"],
        responses: [{ stdout: `${HEAD}\n`, stderr: "" }] },
      { match: ["merge-base", "--is-ancestor", HEAD, "main"],
        responses: [{ failure: { exitCode: 128, stderr: "object database unavailable" } }] },
    ]);

    await expect(proveOrdinaryErrandAbandonmentPreservation(exec, "main", paused()))
      .resolves.toMatchObject({
        kind: "error",
        message: "git merge-base: nonzero-exit (exit 128): object database unavailable",
      });
  });

  it("refuses remote preservation explicitly when origin is absent", async () => {
    const { exec } = scriptGitExec([
      { match: ["rev-parse", "--verify", "refs/heads/chore/discard^{commit}"],
        responses: [{ stdout: `${HEAD}\n`, stderr: "" }] },
      { match: ["merge-base", "--is-ancestor", HEAD, "main"],
        responses: [{ failure: { exitCode: 1, stderr: "not an ancestor" } }] },
      { match: ["remote", "get-url", "origin"],
        responses: [{ failure: { exitCode: 2, stderr: "no such remote" } }] },
    ]);

    await expect(proveOrdinaryErrandAbandonmentPreservation(exec, "main", paused()))
      .resolves.toMatchObject({
        kind: "refused",
        reason: "preservation-unproven",
        message: expect.stringContaining("origin"),
      });
  });
});

it("keeps the branch when an unoccupied base moves before the exact ref transaction", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-abandon-ref-"));
  const git = (args: string[], input?: string): string => execFileSync("git", args, {
    cwd,
    ...(input === undefined ? {} : { input }),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  try {
    git(["init", "--initial-branch=main"]);
    git(["config", "user.name", "Test"]);
    git(["config", "user.email", "test@example.com"]);
    git(["commit", "--allow-empty", "-m", "base"]);
    const oldBaseHead = git(["rev-parse", "HEAD"]);
    git(["branch", "chore/discard", oldBaseHead]);
    git(["switch", "-c", "work"]);
    const tree = git(["rev-parse", "HEAD^{tree}"]);
    const newBaseHead = git(["commit-tree", tree, "-p", oldBaseHead, "-m", "base moved"]);
    git(["update-ref", "refs/heads/main", newBaseHead, oldBaseHead]);
    const execInput: GitExecInput = async (args, input) => git(args, input);

    await expect(deleteAbandonedBranchAtExactBase(execInput, cwd, {
      base: "main", baseHead: oldBaseHead, branch: "chore/discard", branchHead: oldBaseHead,
    })).rejects.toThrow();
    expect(git(["rev-parse", "chore/discard"])).toBe(oldBaseHead);

    await deleteAbandonedBranchAtExactBase(execInput, cwd, {
      base: "main", baseHead: newBaseHead, branch: "chore/discard", branchHead: oldBaseHead,
    });
    expect(git(["branch", "--list", "chore/discard"])).toBe("");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it("retains a successful deletion when checkout lock release fails", async () => {
  const result = await settleAbandonBranchLease(
    async () => ({ kind: "removed" }),
    async () => { throw new Error("could not release HEAD lock"); },
  );
  expect(result).toEqual({ kind: "removed", releaseError: "could not release HEAD lock" });
});

describe("reapZeroDeltaBranch verification failures", () => {
  const unusedInput: GitExecInput = async () => { throw new Error("unexpected ref mutation"); };

  it.each([
    { exitCode: 1, expected: "local base head could not be proven" },
    { exitCode: 128, expected: "git rev-parse: nonzero-exit (exit 128)" },
  ])("distinguishes an absent base from a base-read error ($exitCode)", async ({ exitCode, expected }) => {
    const exec: GitExec = async (command, args) => {
      throw gitError(command, args, "object database unavailable", exitCode);
    };
    const result = await reapZeroDeltaBranch(exec, unusedInput, "main", paused(), HEAD, "/tmp/unused");
    expect(result).toMatchObject({ kind: "preserved", reason: expect.stringContaining(expected) });
  });

  it.each([
    { exitCode: 1, expected: "branch has content outside the local base" },
    { exitCode: 128, expected: "git merge-base: nonzero-exit (exit 128)" },
  ])("distinguishes non-ancestry from a merge-base error ($exitCode)", async ({ exitCode, expected }) => {
    const { exec } = scriptGitExec([
      { match: ["rev-parse", "--verify", "--quiet", "refs/heads/main^{commit}"],
        responses: [{ stdout: `${HEAD}\n`, stderr: "" }] },
      { match: ["merge-base", "--is-ancestor", HEAD, HEAD],
        responses: [{ failure: { exitCode, stderr: "object database unavailable" } }] },
    ]);
    const result = await reapZeroDeltaBranch(exec, unusedInput, "main", paused(), HEAD, "/tmp/unused");
    expect(result).toMatchObject({ kind: "preserved", reason: expect.stringContaining(expected) });
  });
});
