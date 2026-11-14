/** The tracked-state predicate treats only an unborn HEAD or a missing repository as tracking nothing. */

import { describe, expect, it } from "vitest";
import { findTrackedStateRoots } from "../../../../src/lib/store/selection.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import { makeGitProcessError } from "../../../helpers/git-exec-fake.js";

function failingHead(exitCode: number, stderr: string): GitExec {
  return async (command, args) => { throw makeGitProcessError({ command, args, exitCode, stderr }); };
}

describe("tracked-state predicate failures", () => {
  it("finds nothing tracked over an unborn HEAD", async () => {
    expect(await findTrackedStateRoots(failingHead(1, ""))).toEqual([]);
  });

  it("finds nothing tracked outside a Git repository", async () => {
    expect(await findTrackedStateRoots(failingHead(128, "fatal: not a git repository (or any of the parent directories): .git")))
      .toEqual([]);
  });

  it("throws any other Git failure rather than reading it as a tree that tracks nothing", async () => {
    const dubious = "fatal: detected dubious ownership in repository at '/shared'";
    await expect(findTrackedStateRoots(failingHead(128, dubious))).rejects.toThrow(/dubious ownership/u);
  });

  it("throws when the tree listing fails", async () => {
    const exec: GitExec = async (command, args) => {
      if (args[0] === "rev-parse") return { stdout: "4b825dc642cb6eb9a060e54bf8d69288fbee4904\n", stderr: "" };
      throw makeGitProcessError({ command, args, exitCode: 128, stderr: "fatal: not a tree object" });
    };
    await expect(findTrackedStateRoots(exec)).rejects.toThrow(/not a tree object/u);
  });
});
