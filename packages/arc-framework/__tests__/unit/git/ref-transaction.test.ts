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
