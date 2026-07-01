import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
} from "../helpers/integration.js";
import { filterCommitsReachableFromHead } from "../../src/lib/git/index.js";

describe("filterCommitsReachableFromHead", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempRepo();
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  it("keeps candidates that are ancestors of HEAD and drops unreachable candidates", async () => {
    const root = await makeCommit(dir, "root");
    const mainTip = await makeCommit(dir, "main tip");
    await execFileAsync("git", ["checkout", "-b", "side", root], { cwd: dir });
    const sideOnly = await makeCommit(dir, "side only");
    await execFileAsync("git", ["checkout", "main"], { cwd: dir });

    const reachable = await filterCommitsReachableFromHead(
      makeGitExec(dir),
      [sideOnly, root, mainTip],
    );

    expect(reachable).toEqual([root, mainTip]);
  });

  it("returns an empty set when HEAD is unborn", async () => {
    const reachable = await filterCommitsReachableFromHead(
      makeGitExec(dir),
      ["a".repeat(40)],
    );

    expect(reachable).toEqual([]);
  });
});
