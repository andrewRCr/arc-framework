import { describe, expect, it } from "vitest";

import { scriptGitExec } from "../../../../../helpers/git-exec-fake.js";
import { listFrontlineChangedFiles } from
  "../../../../../../src/scripts/review-gate/hosts/local/frontline-changed-files.js";

const diffBaseSha = "a".repeat(40);
const headSha = "c".repeat(40);
const args = [
  "diff", "--numstat", "-z", "--no-renames", "--no-textconv", "--diff-filter=d", `${diffBaseSha}..${headSha}`, "--",
];

function list(stdout: string) {
  const signal = new AbortController().signal;
  const { exec, calls } = scriptGitExec([{ match: args, responses: [{ stdout }] }]);
  return {
    calls,
    signal,
    result: listFrontlineChangedFiles(exec, { reviewRoot: "/review/checkout", diffBaseSha, headSha, signal }),
  };
}

describe("frontline changed-file listing", () => {
  it("lists each non-deleted path the exact target changes with Git's binary judgment", async () => {
    const { calls, signal, result } = list([
      "2\t1\tsrc/keep.ts",
      "-\t-\tassets/logo.png",
      "0\t0\tsrc/empty.ts",
      "3\t0\tdocs/read me.md",
      "4\t0\tsrc/übersetzung.ts",
      "1\t0\tsrc/tab\tname.ts",
      "",
    ].join("\0"));

    await expect(result).resolves.toEqual([
      { path: "src/keep.ts", binary: false },
      { path: "assets/logo.png", binary: true },
      { path: "src/empty.ts", binary: false },
      { path: "docs/read me.md", binary: false },
      { path: "src/übersetzung.ts", binary: false },
      { path: "src/tab\tname.ts", binary: false },
    ]);
    expect(calls).toEqual([{
      command: "git",
      args,
      options: { cwd: "/review/checkout", signal, preserveOutput: true },
    }]);
  });

  it("lists nothing for a target that changes no surviving path", async () => {
    await expect(list("").result).resolves.toEqual([]);
  });

  it.each([
    ["a record without counts", "src/keep.ts\0"],
    ["a record with one binary count", "-\t3\tsrc/keep.ts\0"],
    ["a record without a path", "1\t0\t\0"],
    ["a rename record", "1\t0\t\0src/old.ts\0src/new.ts\0"],
  ])("refuses %s rather than guessing the changed set", async (_shape, stdout) => {
    await expect(list(stdout).result).rejects.toThrow("unrecognized changed-file listing");
  });
});
