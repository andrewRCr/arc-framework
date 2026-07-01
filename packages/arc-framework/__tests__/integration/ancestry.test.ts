import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
} from "../helpers/integration.js";
import {
  filterCommitsReachableFromHead,
  reduceCommitsToCausallyMaximal,
  type GitExec,
} from "../../src/lib/git/index.js";

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

describe("reduceCommitsToCausallyMaximal", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempRepo();
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  it("reduces a linear chain to the causally latest commit", async () => {
    const root = await makeCommit(dir, "root");
    const middle = await makeCommit(dir, "middle");
    const tip = await makeCommit(dir, "tip");

    const maximal = await reduceCommitsToCausallyMaximal(
      makeGitExec(dir),
      [root, middle, tip],
    );

    expect(maximal).toEqual([tip]);
  });

  it("keeps genuine concurrent commits", async () => {
    const root = await makeCommit(dir, "root");
    const left = await makeCommit(dir, "left");
    await execFileAsync("git", ["checkout", "-b", "right", root], { cwd: dir });
    const right = await makeCommit(dir, "right");

    const maximal = await reduceCommitsToCausallyMaximal(
      makeGitExec(dir),
      [left, right],
    );

    expect(maximal).toEqual([left, right]);
  });

  it("returns 0- or 1-element inputs unchanged without invoking git", async () => {
    const calls: string[][] = [];
    const exec: GitExec = async (_cmd, args) => {
      calls.push(args);
      throw new Error("should not be called");
    };
    const commit = "a".repeat(40);

    await expect(reduceCommitsToCausallyMaximal(exec, [])).resolves.toEqual([]);
    await expect(reduceCommitsToCausallyMaximal(exec, [commit])).resolves.toEqual([commit]);
    expect(calls).toEqual([]);
  });
});
