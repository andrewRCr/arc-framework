/** Config absence needs a completed missing-value result, while failed reads remain retryable errors. */
import { expect, it, vi } from "vitest";
import { gitConfigGet, gitConfigUnset, type GitExec } from "../../../src/lib/git/exec.js";
import { normalizeGitRejection } from "../../../src/lib/git/process-error.js";

const key = "arc.releaseOptedIn";
const invocation = { command: "git", args: ["config", "--get", key] };

it.each([
  ["signal", { exitCode: 1, signal: "SIGTERM" }],
  ["cancellation", { exitCode: 1, isCanceled: true }],
  ["timeout", { exitCode: 1, timedOut: true }],
  ["output limit", { exitCode: 1, isMaxBuffer: true }],
  ["malformed key", { exitCode: 1, stderr: "error: key does not contain a section\n" }],
  ["whitespace diagnostic", { exitCode: 1, stderr: " \n" }],
  ["partial output", { exitCode: 1, stdout: "partial value" }],
  ["malformed configuration", { exitCode: 128, stderr: "fatal: bad config line 1\n" }],
] as const)("refuses %s before unset, then succeeds after repair", async (_label, evidence) => {
  const failure = normalizeGitRejection({ stdout: "", stderr: "", ...evidence }, invocation);
  const exec = vi.fn<GitExec>().mockRejectedValueOnce(failure)
    .mockResolvedValueOnce({ stdout: "true\n" }).mockResolvedValueOnce({ stdout: "" });
  await expect(gitConfigUnset(exec, key)).rejects.toBe(failure);
  expect(exec).toHaveBeenCalledTimes(1);
  await expect(gitConfigUnset(exec, key)).resolves.toBeUndefined();
  expect(exec).toHaveBeenNthCalledWith(3, "git", ["config", "--unset", key]);
});

it.each([
  { exitCode: 1 },
  { exitCode: 1, stdout: "" },
  { exitCode: 1, stderr: "" },
])("does not infer absent output from omitted legacy streams %j", async (failure) => {
  const exec = vi.fn<GitExec>().mockRejectedValueOnce(failure).mockResolvedValueOnce({ stdout: "true\n" });
  await expect(gitConfigGet(exec, key)).rejects.toMatchObject({ exitCode: 1 });
  await expect(gitConfigGet(exec, key)).resolves.toBe("true");
});

it("accepts typed and fully captured legacy missing-key evidence", async () => {
  const evidence = { exitCode: 1, stdout: "", stderr: "" };
  for (const failure of [normalizeGitRejection(evidence, invocation), evidence,
    { exitCode: 1, stdout: new Uint8Array(), stderr: new Uint8Array() }]) {
    const exec = vi.fn<GitExec>().mockRejectedValue(failure);
    await expect(gitConfigGet(exec, key)).resolves.toBeUndefined();
    await expect(gitConfigUnset(exec, key)).resolves.toBeUndefined();
    expect(exec.mock.calls.every(([, args]) => args[1] === "--get")).toBe(true);
  }
});

it("keeps an explicitly configured empty value distinct from an absent key", async () => {
  const exec = vi.fn<GitExec>().mockResolvedValueOnce({ stdout: "\n" });
  await expect(gitConfigGet(exec, key)).resolves.toBe("");
});
