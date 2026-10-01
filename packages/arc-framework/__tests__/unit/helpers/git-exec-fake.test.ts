import { describe, expect, it } from "vitest";

import {
  makeGitProcessError, scriptGitExec, scriptGitExecInput, scriptRawGitExec,
} from "../../helpers/git-exec-fake.js";
import { gitFailureText } from "../../../src/lib/git/process-error.js";

describe("makeGitProcessError", () => {
  it("classifies a missing fetched remote ref", () => {
    const error = makeGitProcessError({
      command: "git",
      args: ["fetch", "origin", "missing"],
      exitCode: 128,
      stderr: "fatal: couldn't find remote ref missing",
    });

    expect(error).toMatchObject({
      kind: "nonzero-exit",
      expectedOutcome: "absent-remote-ref",
      command: "git",
      args: ["fetch", "origin", "missing"],
    });
  });

  it("classifies a rejected leased push", () => {
    const error = makeGitProcessError({
      command: "git",
      args: ["push", "origin", "--force-with-lease", "branch"],
      exitCode: 1,
      stderr: "! [rejected] branch (stale info)",
    });
    expect(error.expectedOutcome).toBe("stale-lease");
  });

  it.each([
    [{ isCanceled: true }, "canceled"],
    [{ timedOut: true }, "timed-out"],
  ] as const)("classifies %j and preserves stderr", (status, kind) => {
    const error = makeGitProcessError({
      command: "git", args: ["fetch"], ...status, stderr: "partial diagnostic",
    });
    expect(error).toMatchObject({ kind, stderr: "partial diagnostic" });
  });

  it("preserves signal termination without inventing an exit code", () => {
    const error = makeGitProcessError({
      command: "git", args: ["status"], signal: "SIGTERM", stderr: "terminated",
    });
    expect(error).toMatchObject({ kind: "nonzero-exit", signal: "SIGTERM", exitCode: undefined });
  });

  it("preserves partial string and byte stdout on exit", () => {
    const textError = makeGitProcessError({
      command: "git", args: ["merge"], exitCode: 1, stdout: "conflict details",
    });
    const byteError = makeGitProcessError({
      command: "git", args: ["diff", "--raw"], exitCode: 1,
      stdout: Uint8Array.from([0, 128, 255]),
    });
    expect(textError.stdout).toBe("conflict details");
    expect([...byteError.stdout].map((character) => character.charCodeAt(0))).toEqual([0, 128, 255]);
  });

  it("exposes stderr through gitFailureText", () => {
    const error = makeGitProcessError({
      command: "git", args: ["merge"], exitCode: 1, stderr: "merge failed",
    });
    expect(gitFailureText(error)).toBe("merge failed");
  });
});

describe("stdin and raw Git scripts", () => {
  it("matches input arguments, sequences responses, and records stdin", async () => {
    const { exec, calls } = scriptGitExecInput([{
      match: ["hash-object", "--stdin"], responses: ["first", "last"],
    }]);
    await expect(exec(["hash-object", "--stdin"], "payload", { cwd: "/repo" }))
      .resolves.toBe("first");
    await expect(exec(["hash-object", "--stdin"], "next")).resolves.toBe("last");
    await expect(exec(["hash-object", "--stdin"], "next")).resolves.toBe("last");
    expect(calls).toEqual([
      { args: ["hash-object", "--stdin"], input: "payload", options: { cwd: "/repo" } },
      { args: ["hash-object", "--stdin"], input: "next", options: undefined },
      { args: ["hash-object", "--stdin"], input: "next", options: undefined },
    ]);
  });

  it("matches a raw prefix, resolves byte output, and records byte input", async () => {
    const output = Uint8Array.from([0, 128, 255]);
    const input = Uint8Array.from([1, 2]);
    const { exec, calls } = scriptRawGitExec([{
      match: { prefix: ["cat-file"] }, responses: [{ stdout: output }],
    }]);
    await expect(exec(["cat-file", "blob", "abc"], { cwd: "/repo", input }))
      .resolves.toEqual({ stdout: output });
    expect(calls).toEqual([{
      args: ["cat-file", "blob", "abc"], options: { cwd: "/repo", input },
    }]);
  });

  it("rejects typed failures from both variants", async () => {
    const input = scriptGitExecInput([{
      match: ["mktree"], responses: [{ failure: { exitCode: 1, stderr: "invalid tree" } }],
    }]);
    const raw = scriptRawGitExec([{
      match: ["fetch", "origin", "missing"],
      responses: [{ failure: { exitCode: 128, stderr: "fatal: couldn't find remote ref missing" } }],
    }]);
    await expect(input.exec(["mktree"], "bad")).rejects.toMatchObject({
      kind: "nonzero-exit", stderr: "invalid tree", command: "git", args: ["mktree"],
    });
    await expect(raw.exec(["fetch", "origin", "missing"])).rejects.toMatchObject({
      kind: "nonzero-exit", expectedOutcome: "absent-remote-ref", command: "git",
    });
  });

  it("classifies raw byte stderr and preserves every diagnostic byte", async () => {
    const diagnostic = "fatal: couldn't find remote ref missing";
    const stderr = Uint8Array.from([...new TextEncoder().encode(diagnostic), 0, 128, 255]);
    const raw = scriptRawGitExec([{
      match: ["fetch", "origin", "missing"],
      responses: [{ failure: { exitCode: 128, stderr } }],
    }]);

    await expect(raw.exec(["fetch", "origin", "missing"])).rejects.toMatchObject({
      kind: "nonzero-exit", expectedOutcome: "absent-remote-ref",
      stderr: diagnostic + "\0\u0080\u00ff", command: "git", args: ["fetch", "origin", "missing"],
    });
  });

  it("rejects unmatched calls from both variants with their arguments", async () => {
    await expect(scriptGitExecInput([]).exec(["mktree"], "payload"))
      .rejects.toThrow(/git.*mktree/);
    await expect(scriptRawGitExec([]).exec(["cat-file", "blob", "abc"]))
      .rejects.toThrow(/git.*cat-file.*blob.*abc/);
  });
});

describe("scriptGitExec", () => {
  it("matches exact command arguments by default", async () => {
    const { exec } = scriptGitExec([
      { match: ["status"], responses: [{ stdout: "clean" }] },
    ]);
    await expect(exec("git", ["status"])).resolves.toEqual({ stdout: "clean" });
    await expect(exec("git", ["status", "--short"])).rejects.toThrow(/git.*status.*--short/);
  });

  it("distinguishes gh from git", async () => {
    const { exec } = scriptGitExec([
      { command: "gh", match: ["pr", "view"], responses: [{ stdout: "PR" }] },
    ]);
    await expect(exec("gh", ["pr", "view"])).resolves.toEqual({ stdout: "PR" });
    await expect(exec("git", ["pr", "view"])).rejects.toThrow(/git.*pr.*view/);
  });

  it("opts into prefix and predicate matching", async () => {
    const { exec } = scriptGitExec([
      { match: { prefix: ["show"] }, responses: [{ stdout: "prefix" }] },
      {
        match: { predicate: (args) => args[0] === "diff" && args.includes("--raw") },
        responses: [{ stdout: "predicate" }],
      },
    ]);
    await expect(exec("git", ["show", "HEAD:file"])).resolves.toEqual({ stdout: "prefix" });
    await expect(exec("git", ["diff", "--raw"])).resolves.toEqual({ stdout: "predicate" });
  });

  it("uses the first matching declaration", async () => {
    const { exec } = scriptGitExec([
      { match: { prefix: ["show"] }, responses: [{ stdout: "first" }] },
      { match: ["show", "HEAD"], responses: [{ stdout: "second" }] },
    ]);
    await expect(exec("git", ["show", "HEAD"])).resolves.toEqual({ stdout: "first" });
  });

  it("consumes response sequences and repeats the last response", async () => {
    const { exec } = scriptGitExec([
      { match: ["status"], responses: [{ stdout: "one" }, { stdout: "two" }] },
    ]);
    await expect(exec("git", ["status"])).resolves.toEqual({ stdout: "one" });
    await expect(exec("git", ["status"])).resolves.toEqual({ stdout: "two" });
    await expect(exec("git", ["status"])).resolves.toEqual({ stdout: "two" });
  });

  it("computes a response from the call arguments and options", async () => {
    const { exec } = scriptGitExec([
      { match: { prefix: ["show"] }, responses: [(call) => ({
        stdout: `${call.args[1]} at ${call.options?.cwd}`,
      })] },
    ]);
    await expect(exec("git", ["show", "HEAD"], { cwd: "/repo" }))
      .resolves.toEqual({ stdout: "HEAD at /repo" });
  });

  it("records every call with command, arguments, and options", async () => {
    const { exec, calls } = scriptGitExec([
      { match: ["status"], responses: [{ stdout: "ok" }] },
    ]);
    await exec("git", ["status"], { cwd: "/repo", diagnosticLocale: "stable" });
    expect(calls).toEqual([{
      command: "git", args: ["status"], options: { cwd: "/repo", diagnosticLocale: "stable" },
    }]);
  });

  it("rejects a scripted failure as a normalized GitProcessError", async () => {
    const { exec } = scriptGitExec([{
      match: ["fetch", "origin", "missing"],
      responses: [{ failure: { exitCode: 128, stderr: "fatal: couldn't find remote ref missing" } }],
    }]);
    await expect(exec("git", ["fetch", "origin", "missing"])).rejects.toMatchObject({
      kind: "nonzero-exit", expectedOutcome: "absent-remote-ref",
      command: "git", args: ["fetch", "origin", "missing"],
    });
  });

  it("names the command and arguments of an unmatched call", async () => {
    const { exec } = scriptGitExec([]);
    await expect(exec("gh", ["pr", "view", "42"]))
      .rejects.toThrow(/gh.*pr.*view.*42/);
  });
});
