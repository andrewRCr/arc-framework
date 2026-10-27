import { describe, expect, it } from "vitest";

import { parsePushPorcelain, pushRefs } from "../../../src/lib/git/push.js";
import { GitProcessError } from "../../../src/lib/git/process-error.js";

// Recorded from Git 2.55 pushes to a disposable bare repository; paths and OIDs abbreviated.
describe("push porcelain", () => {
  it.each([
    ["*", "first:refs/arc/a", "[new reference]"],
    ["=", "first:refs/arc/a", "[up to date]"],
    [" ", "second:refs/arc/a", "first..second"],
    ["+", "other:refs/arc/a", "second...other (forced update)"],
    ["-", ":refs/arc/a", "[deleted]"],
  ])("reads %j as success", (flag, pair, summary) => {
    const stdout = `To <remote>\n${flag}\t${pair}\t${summary}\nDone\n`;
    expect(parsePushPorcelain(stdout, "", 0)).toEqual({
      status: "refs", refs: [{ ref: "refs/arc/a", status: "ok" }], stdout, stderr: "",
    });
  });

  it.each([
    ["(delete):refs/arc/a", "rejected", "stale info", "rejected"],
    ["second:refs/arc/a", "rejected", "non-fast-forward", "rejected"],
    ["second:refs/arc/a", "rejected", "fetch first", "rejected"],
    ["second:refs/arc/a", "remote rejected", "pre-receive hook declined", "remote-rejected"],
    ["second:refs/arc/a", "remote rejected", "atomic transaction failed", "remote-rejected"],
    ["first:refs/arc/a", "rejected", "atomic push failed", "atomic-collateral"],
    ["first:refs/arc/a", "remote rejected", "atomic push failure", "atomic-collateral"],
  ])("preserves the cause of %s [%s] (%s)", (pair, label, reason, status) => {
    const stdout = `To <remote>\n!\t${pair}\t[${label}] (${reason})\nDone\n`;
    const stderr = "remote: server's own message        \nerror: failed to push some refs\n";
    expect(parsePushPorcelain(stdout, stderr, 1)).toEqual({
      status: "refs", refs: [{ ref: "refs/arc/a", status,
        ...(status === "atomic-collateral" ? {} : { reason }) }], stdout, stderr,
    });
  });


  it.each([
    ["reason from pre-push\nerror: failed to push some refs to '<remote>'\n", 1, "hook-declined"],
    ["error: src refspec does not match any\n", 1, "hook-declined"],
    ["fatal: the receiving end does not support --atomic push\nfatal: the remote end hung up unexpectedly\n",
      128, "atomic-unsupported"],
  ])("classifies a whole-push refusal with its exact text", (stderr, exitCode, status) => {
    expect(parsePushPorcelain("", stderr, exitCode)).toEqual({ status, stdout: "", stderr });
  });

  it.each(["network", "auth", "error", "timeout"] as const)("keeps an unreachable cause: %s", (cause) => {
    const stderr = "fatal: remote connection failed\n";
    expect(parsePushPorcelain("", stderr, 128, cause)).toEqual({
      status: "unreachable", cause, stdout: "", stderr,
    });
  });

});

it("preserves unconfirmed descendant termination beside a canceled push's captured diagnostics", async () => {
  const failure = new GitProcessError({ kind: "canceled", command: "git", args: ["push"], isCanceled: true,
    descendantsUnconfirmed: true, stdout: "partial push output", stderr: "original push diagnostic" });
  const result = await pushRefs(async () => { throw failure; }, "origin", [{ ref: "refs/heads/example", next: "a".repeat(40) }]);
  expect(result).toMatchObject({ status: "unreachable", stdout: failure.stdout });
  expect(result.stderr).toContain(failure.stderr);
  expect(result.stderr).toContain("descendant processes not confirmed ended");
});

it("keeps a known local nonstart out of remote and hook classifications", async () => {
  const changes = [{ ref: "refs/arc/work/one", next: "a".repeat(40), expected: null }];
  const failure = new GitProcessError({ kind: "command-line-capacity", command: "git", args: ["push"], commandLine: { units: 40_000, limit: 32_767 } });
  const outcome = await pushRefs(async () => { throw failure; }, "origin", changes);
  expect(outcome).toMatchObject({ status: "not-started", reason: "command-line-capacity", stdout: "", stderr: "",
    message: expect.stringMatching(/40000.*32767/u) });
});
