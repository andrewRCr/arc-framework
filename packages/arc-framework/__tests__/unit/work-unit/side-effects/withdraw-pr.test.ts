/**
 * Unit tests for the `withdraw-pr` side-effect — the `reopen` PR withdrawal.
 *
 * Withdrawing the open PR is a `gh` write (no existing wrapper; the `gh`-read
 * source is the model), hand-rolled behind the injected executor. Two modes:
 * `close` (the default — close the PR outright) and `draft` (convert it back to
 * a draft, the `--keep-pr` path). Each behavior asserts the exact `gh` argv over
 * a spy executor.
 */

import { describe, it, expect } from "vitest";

import type { ExecResult, GitExec } from "../../../../src/lib/git/exec.js";
import { withdrawPr } from "../../../../src/lib/work-unit/side-effects/withdraw-pr.js";

/** A spy executor recording each `(cmd, args)` invocation. */
function spyExec(): { exec: GitExec; calls: { cmd: string; args: string[] }[] } {
  const calls: { cmd: string; args: string[] }[] = [];
  const exec: GitExec = (cmd, args) => {
    calls.push({ cmd, args });
    return Promise.resolve<ExecResult>({ stdout: "" });
  };
  return { exec, calls };
}

describe("withdrawPr — close (default)", () => {
  it("closes the PR for the branch", async () => {
    const { exec, calls } = spyExec();

    await withdrawPr({ exec }, { branch: "feat/foo", mode: "close" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe("gh");
    expect(calls[0]!.args).toEqual(["pr", "close", "feat/foo"]);
  });
});

describe("withdrawPr — draft (convert back)", () => {
  it("converts the PR back to a draft, leaving it open", async () => {
    const { exec, calls } = spyExec();

    await withdrawPr({ exec }, { branch: "feat/foo", mode: "draft" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual(["pr", "ready", "feat/foo", "--undo"]);
  });
});
