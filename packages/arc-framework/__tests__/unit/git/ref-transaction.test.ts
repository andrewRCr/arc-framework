import { describe, expect, it } from "vitest";

import type { GitExecInput } from "../../../src/lib/git/exec.js";
import { updateRefTransaction } from "../../../src/lib/git/ref-transaction.js";
import { makeGitProcessError, scriptGitExec } from "../../helpers/git-exec-fake.js";

const ref = "refs/arc/held";
const old = "a".repeat(40);
const next = "b".repeat(40);

function matchingFailure(version: string) {
  const original = makeGitProcessError({ command: "git", args: ["update-ref", "--stdin"], exitCode: 128,
    stderr: "fatal: prepare: cannot lock references\n" });
  const execInput: GitExecInput = async () => { throw original; };
  const { exec } = scriptGitExec([
    { match: { prefix: ["for-each-ref"] }, responses: [{ stdout: `${ref} ${old}\n` }] },
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
    const execInput: GitExecInput = async () => {
      throw makeGitProcessError({ command: "git", args: ["update-ref", "--stdin"], exitCode: 128,
        stderr: `fatal: cannot lock ref '${ref}': is at ${next} but expected ${old}\n` });
    };
    const { exec, calls } = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [
      { failure: { exitCode: 128, stderr: `fatal: Duplicated ref, and SHA1s don't match: ${ref}\n` } },
      { stdout: `${ref} ${next}\n` },
    ] }]);
    await expect(updateRefTransaction({ exec, execInput }, [{ ref, next: "c".repeat(40), expected: old }]))
      .resolves.toEqual({ status: "lost-race", refs: [{ ref, expected: old, actual: next }] });
    expect(calls.filter((call) => call.args[0] === "for-each-ref")).toHaveLength(2);
  });
});
