/** Merge output is usable only after a completed merge or a completed conflict result. */
import { expect, it, vi } from "vitest";
import { gitMergeFile, type GitExec } from "../../../src/lib/git/exec.js";
import { normalizeGitRejection } from "../../../src/lib/git/process-error.js";

const args = ["merge-file", "-p", "current.txt", "base.txt", "other.txt"];
const invocation = { command: "git", args };
const clean = "resolved content with trailing spaces  \n\n";

it.each([
  ["signaled conflict status", { exitCode: 1, signal: "SIGTERM" }],
  ["cancellation", { exitCode: 1, isCanceled: true }],
  ["timeout", { exitCode: 1, timedOut: true }],
  ["output limit", { exitCode: 1, isMaxBuffer: true }],
  ["signal without status", { signal: "SIGTERM" }],
  ["missing executable", { code: "ENOENT" }],
  ["unexpected failure", { message: "executor failed" }],
  ["fatal merge status", { exitCode: 255 }],
] as const)("refuses %s and permits a repaired retry", async (_label, evidence) => {
  const failure = normalizeGitRejection({ ...evidence, stdout: "partial merge output\n" }, invocation);
  const exec = vi.fn<GitExec>().mockRejectedValueOnce(failure).mockResolvedValueOnce({ stdout: clean });

  await expect(gitMergeFile(exec, "current.txt", "base.txt", "other.txt")).rejects.toBe(failure);
  await expect(gitMergeFile(exec, "current.txt", "base.txt", "other.txt"))
    .resolves.toEqual({ content: clean, hasConflicts: false });
  expect(exec).toHaveBeenNthCalledWith(1, "git", args, { preserveOutput: true });
  expect(exec).toHaveBeenNthCalledWith(2, "git", args, { preserveOutput: true });
});

it.each([1, 2, 127])("preserves exact conflict output for completed status %i", async (exitCode) => {
  const content = "<<<<<<< current.txt\nours  \n=======\ntheirs\n>>>>>>> other.txt\n\n";
  const failure = normalizeGitRejection({ exitCode, stdout: content }, invocation);
  const exec = vi.fn<GitExec>().mockRejectedValue(failure);
  await expect(gitMergeFile(exec, "current.txt", "base.txt", "other.txt"))
    .resolves.toEqual({ content, hasConflicts: true });
});

it("normalizes a legacy interrupted rejection without accepting its partial conflict content", async () => {
  const exec = vi.fn<GitExec>().mockRejectedValueOnce({ exitCode: 1, signal: "SIGTERM", stdout: "partial" })
    .mockResolvedValueOnce({ stdout: clean });
  await expect(gitMergeFile(exec, "current.txt", "base.txt", "other.txt"))
    .rejects.toMatchObject({ kind: "nonzero-exit", signal: "SIGTERM", stdout: "partial" });
  await expect(gitMergeFile(exec, "current.txt", "base.txt", "other.txt"))
    .resolves.toEqual({ content: clean, hasConflicts: false });
});
