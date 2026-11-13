/** Unavailable hold evidence never becomes an instruction to discard the hold. */
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { readWindowHold, type WindowRecord } from "../../../../src/scripts/cutover-window/hold.js";
import { runWindow } from "../../../../src/scripts/cutover-window/main.js";

it("reports an unreadable hold as a retryable stop, then reads it after access is repaired", async () => {
  const tip = "a".repeat(40);
  const repo = resolve("target");
  const record: WindowRecord = { version: 1, flip: { branch: "feat/flip", pullRequest: 7, head: tip },
    worktrees: [{ path: repo, head: tip, branch: "main" }], branches: { live: {}, local: { main: tip }, origin: { main: tip } },
    refs: { local: {}, origin: {}, tracking: {} } };
  const { exec } = scriptGitExec([
    { match: ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-window/"], responses: [
      { failure: { exitCode: 128, stderr: "fatal: corrupt ref store" } },
      { stdout: `refs/arc-window/record ${tip}\nrefs/arc-window/complete ${tip}\n` },
    ] },
    { match: ["--no-replace-objects", "show", `${tip}:window.json`], responses: [{ stdout: JSON.stringify(record) }] },
  ]);
  const handlers = { inspect: async ({ repo: target }: { repo: string }) => ({
    operation: "inspect", status: "passed" as const, findings: [], data: await readWindowHold({ repo: target, exec,
      execInput: async () => { throw new Error("Unexpected write while reading the hold"); } }),
  }) };
  async function run() {
    const stdout: string[] = []; const stderr: string[] = [];
    const exit = await runWindow(["inspect", "--repo", repo, "--json"], handlers, {
      stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); },
    });
    return { exit, result: JSON.parse(stdout.join("")) as unknown, report: stderr.join("") };
  }
  const failed = await run();
  expect(failed.exit).toBe(1);
  expect(failed.result).toMatchObject({ status: "stopped", findings: [expect.objectContaining({
    condition: expect.stringContaining("corrupt ref store"), remedy: expect.stringContaining("retry"),
  })] });
  expect(failed.report).not.toContain("Remove");
  expect(await run()).toMatchObject({ exit: 0, result: { status: "passed", data: { tip, record } } });
});
