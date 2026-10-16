import { describe, expect, it } from "vitest";

import type { GitProcessError } from "../../../src/lib/git/process-error.js";
import type { GitExec, GitExecInput, GitExecOptions, RawGitExec } from "../../../src/lib/git/exec.js";
import { parseGitVersion, withGitVersionFloor, type GitVersionProbe } from "../../../src/lib/git/version-floor.js";
import { makeGitProcessError, scriptGitExec } from "../../helpers/git-exec-fake.js";

describe("Git version parsing", () => {
  it.each([
    ["git version 2.47.0\n", { major: 2, minor: 47, patch: 0 }],
    ["git version 2.47.1.windows.1", { major: 2, minor: 47, patch: 1 }],
    ["git version 2.47.0 (Apple Git-154)", { major: 2, minor: 47, patch: 0 }],
    ["git version 2.48.0.rc0", { major: 2, minor: 48, patch: 0 }],
  ] as const)("reads %s", (output, expected) => {
    expect(parseGitVersion(output)).toEqual(expected);
  });
});

function failedCall(variant: string, error: GitProcessError, probe: GitVersionProbe): () => Promise<unknown> {
  const args = [...error.args];
  if (variant === "plain") {
    const exec: GitExec = async () => { throw error; };
    return () => withGitVersionFloor(exec, probe)(error.command, args);
  }
  if (variant === "stdin") {
    const exec: GitExecInput = async () => { throw error; };
    return () => withGitVersionFloor(exec, probe)(args, "");
  }
  const exec: RawGitExec = async () => { throw error; };
  return () => withGitVersionFloor(exec, probe)(args);
}

describe("failure-time Git floor", () => {
  it.each(["plain", "stdin", "raw"])("explains an unsupported option on Git 2.45 through the %s port", async (variant) => {
    const error = makeGitProcessError({ command: "git", args: ["--unknown-option"], exitCode: 129, stderr: "unknown option" });
    const run = failedCall(variant, error, async () => "git version 2.45.0");
    await expect(run()).rejects.toThrow(/Git 2\.45\.0.*Git 2\.47/u);
  });
});

describe("Git floor diagnostic boundaries", () => {
  it.each(["plain", "stdin", "raw"].flatMap((variant) => [
    { variant, label: "Git 2.47", probe: async (): Promise<string> => "git version 2.47.0" },
    { variant, label: "a later major", probe: async (): Promise<string> => "git version 3.0.0" },
    { variant, label: "unrecognized output", probe: async (): Promise<string> => "unrecognized version output" },
    { variant, label: "a failed probe", probe: async (): Promise<string> => { throw new Error("version invocation failed"); } },
  ]))("keeps the $variant failure with $label", async ({ variant, probe }) => {
    const error = makeGitProcessError({ command: "git", args: ["--unknown-option"], exitCode: 129, stderr: "original Git diagnostic" });
    await expect(failedCall(variant, error, probe)()).rejects.toBe(error);
  });

  it.each(["plain", "stdin", "raw"])("does not probe a successful %s invocation", async (variant) => {
    const probe = async (): Promise<string> => "git version 2.45.0";
    if (variant === "plain") {
      const result = { stdout: "success\n", stderr: "diagnostic\n" };
      const exec: GitExec = async () => result;
      await expect(withGitVersionFloor(exec, probe)("git", ["status"])).resolves.toBe(result);
    } else if (variant === "stdin") {
      const exec: GitExecInput = async () => "object-id\n";
      await expect(withGitVersionFloor(exec, probe)(["hash-object", "--stdin"], "payload")).resolves.toBe("object-id\n");
    } else {
      const result = { stdout: Buffer.from([0, 255, 10]), stderr: Buffer.from("diagnostic\n") };
      const exec: RawGitExec = async () => result;
      await expect(withGitVersionFloor(exec, probe)(["cat-file", "--batch"])).resolves.toBe(result);
    }
  });

  it.each(["plain", "stdin", "raw"].flatMap((variant) => [
    { variant, label: "nonzero", evidence: { exitCode: 128, stderr: "missing remote" } },
    { variant, label: "canceled", evidence: { exitCode: 129, isCanceled: true as const } },
    { variant, label: "timed out", evidence: { exitCode: 129, timedOut: true as const } },
  ]))("keeps a $label $variant failure without consulting an old version", async ({ variant, evidence }) => {
    const error = makeGitProcessError({ command: "git", args: ["fetch", "origin"], ...evidence });
    await expect(failedCall(variant, error, async () => "git version 2.45.0")()).rejects.toBe(error);
  });
});

it("diagnoses the same executable that failed", async () => {
  const args = ["--unknown-option"];
  const { exec } = scriptGitExec([
    { command: "/old/toolchain/git", match: args, responses: [{ failure: { exitCode: 129, stderr: "unknown option" } }] },
    { command: "/old/toolchain/git", match: ["--version"], responses: [{ stdout: "git version 2.45.0" }] },
  ]);
  const wrapped = withGitVersionFloor(exec, async (command, _args, options?: GitExecOptions): Promise<string> => {
    return (await exec(command, ["--version"], options)).stdout;
  });
  await expect(wrapped("/old/toolchain/git", args)).rejects.toThrow(/Git 2\.45\.0.*Git 2\.47/u);
});
