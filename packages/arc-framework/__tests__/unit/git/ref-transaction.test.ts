import { describe, expect, it } from "vitest";

import type { GitExecInput } from "../../../src/lib/git/exec.js";
import { isGitProcessError } from "../../../src/lib/git/process-error.js";
import { updateRefTransaction } from "../../../src/lib/git/ref-transaction.js";
import { makeGitProcessError, scriptGitExec, scriptGitExecInput } from "../../helpers/git-exec-fake.js";

const ref = "refs/arc/held";
const old = "a".repeat(40);
const next = "b".repeat(40);

function matchingFailure(version: string) {
  const original = makeGitProcessError({ command: "git", args: ["update-ref", "--stdin"], exitCode: 128,
    stderr: "fatal: prepare: cannot lock references\n" });
  const execInput: GitExecInput = async (args) => {
    if (args[0] === "for-each-ref") return `${ref} ${old}\n`;
    throw original;
  };
  const { exec } = scriptGitExec([
    { match: ["--version"], responses: [{ stdout: `git version ${version}\n` }] },
  ]);
  return { original, run: () => updateRefTransaction({ exec, execInput }, [{ ref, next, expected: old }]) };
}

describe("unclassified ref transaction failures", () => {
  it("explains the Git 2.47 floor on an older Git when every ref still matches", async () => {
    const { run } = matchingFailure("2.45.0");
    await expect(run()).rejects.toThrow(/Git 2\.45\.0.*Git 2\.47/u);
  });

  it("preserves the original Git failure on a supported Git when every ref still matches", async () => {
    const { original, run } = matchingFailure("2.47.0");
    await expect(run()).rejects.toBe(original);
  });
});

describe("lost races behind a refused torn re-read", () => {
  it("reports the lost race once the re-read runs again", async () => {
    const { exec: execInput, calls } = scriptGitExecInput([
      { match: { prefix: ["-c"] }, responses: [{ failure: { exitCode: 128,
        stderr: `fatal: cannot lock ref '${ref}': is at ${next} but expected ${old}\n` } }] },
      { match: { prefix: ["for-each-ref"] }, responses: [
        { failure: { exitCode: 128, stderr: `fatal: Duplicated ref, and SHA1s don't match: ${ref}\n` } },
        `${ref} ${next}\n`,
      ] },
    ]);
    const { exec } = scriptGitExec([]);
    await expect(updateRefTransaction({ exec, execInput }, [{ ref, next: "c".repeat(40), expected: old }]))
      .resolves.toEqual({ status: "lost-race", refs: [{ ref, expected: old, actual: next }] });
    expect(calls.filter((call) => call.args[0] === "for-each-ref")).toHaveLength(2);
  });
});

describe("reading a failed transaction's refs back", () => {
  const refusal = { exitCode: 128, stderr: "fatal: prepare: cannot lock references\n" };

  it("names the refs on stdin, so a whole-store transaction never grows the command line", async () => {
    const refs = Array.from({ length: 600 }, (_unused, index) => `refs/arc/work/${String(index).padStart(36, "0")}`);
    const { exec: execInput, calls } = scriptGitExecInput([
      { match: { prefix: ["-c"] }, responses: [{ failure: refusal }] },
      { match: { prefix: ["for-each-ref"] }, responses: [refs.map((name) => `${name} ${next}`).join("\n")] },
    ]);
    const { exec } = scriptGitExec([]);
    const outcome = await updateRefTransaction({ exec, execInput }, refs.map((name) => ({ ref: name, next: "c".repeat(40), expected: old })));
    expect(outcome).toMatchObject({ status: "lost-race" });
    const reread = calls.find((call) => call.args[0] === "for-each-ref");
    expect(reread?.args).toEqual(["for-each-ref", "--format=%(refname) %(objectname)", "--stdin"]);
    expect(reread?.input.split("\n").filter(Boolean)).toEqual(refs);
  });

  it.each([
    { name: "a read-back the store directory's removal fails", readBack: { exitCode: 128, stderr: "fatal: not a git repository\n" },
      expected: { kind: "nonzero-exit", exitCode: 128, stderr: "fatal: not a git repository\n" } },
    { name: "a canceled read-back", readBack: { isCanceled: true } as const, expected: { kind: "canceled" } },
  ])("throws $name as its own Git failure, keeping Git's refusal of the transaction as the cause", async ({ readBack, expected }) => {
    const { exec: execInput } = scriptGitExecInput([
      { match: { prefix: ["-c"] }, responses: [{ failure: refusal }] },
      { match: { prefix: ["for-each-ref"] }, responses: [{ failure: readBack }] },
    ]);
    const { exec } = scriptGitExec([]);
    const failure = await updateRefTransaction({ exec, execInput }, [{ ref, next, expected: old }]).catch((error: unknown) => error);
    expect(isGitProcessError(failure)).toBe(true);
    expect(failure).toMatchObject({ ...expected, args: expect.arrayContaining(["for-each-ref"]) });
    expect((failure as Error).cause).toMatchObject({ stderr: refusal.stderr });
  });
});
