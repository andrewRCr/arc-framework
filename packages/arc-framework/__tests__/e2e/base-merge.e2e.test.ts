/** `arc base merge` exact-base behavior against a real remote. */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  removeGitBackedDir,
  runArcNoTty,
} from "./helpers.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

async function fixture(): Promise<{ repo: string; oldBase: string; newBase: string }> {
  const repo = await createTempRepo("arc-base-merge-");
  const publisher = await mkdtemp(join(tmpdir(), "arc-base-merge-publisher-"));
  const remote = await mkdtemp(join(tmpdir(), "arc-base-merge-remote-"));
  cleanup.push(repo, publisher, remote);

  expect((await runArcNoTty(["init", "--yes", "--name", "test-project"], repo)).exitCode).toBe(0);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "init"]);
  const oldBase = await git(repo, ["rev-parse", "HEAD"]);

  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repo, ["remote", "add", "origin", remote]);
  await git(repo, ["push", "-u", "origin", "main"]);
  await git(repo, ["switch", "-c", "feat/current"]);
  await writeFile(join(repo, "feature.txt"), "feature\n", "utf8");
  await git(repo, ["add", "feature.txt"]);
  await git(repo, ["commit", "-m", "feature"]);

  await execFileAsync("git", ["clone", "--branch", "main", remote, publisher]);
  await git(publisher, ["config", "user.email", "publisher@test.com"]);
  await git(publisher, ["config", "user.name", "Publisher"]);
  await writeFile(join(publisher, "remote.txt"), "advance\n", "utf8");
  await git(publisher, ["add", "remote.txt"]);
  await git(publisher, ["commit", "-m", "advance remote"]);
  const newBase = await git(publisher, ["rev-parse", "HEAD"]);
  await git(publisher, ["push", "origin", "main"]);

  // The command must update its explicit authority ref even when the configured
  // fetch mapping sends ordinary fetches somewhere else.
  await git(repo, ["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/custom/*"]);
  return { repo, oldBase, newBase };
}

afterEach(async () => {
  while (cleanup.length > 0) {
    const path = cleanup.pop();
    if (path === undefined) continue;
    if (path.includes("arc-base-merge-publisher-") || path.includes("arc-base-merge-remote-")) {
      await removeGitBackedDir(path);
    } else {
      await cleanupTempDir(path);
    }
  }
});

describe("arc base merge", () => {
  it("refreshes an explicit tracking ref, reports movement, then appends the approved base", async () => {
    const { repo, oldBase, newBase } = await fixture();
    const featureHead = await git(repo, ["rev-parse", "HEAD"]);

    const moved = await runArcNoTty(["base", "merge", "--expected-base", oldBase, "--json"], repo);
    expect(moved.exitCode).toBe(0);
    expect(JSON.parse(moved.stdout)).toMatchObject({
      state: "base-moved",
      expectedBase: oldBase,
      actualBase: newBase,
    });
    expect(await git(repo, ["rev-parse", "refs/remotes/origin/main^{commit}"])).toBe(newBase);
    expect(await git(repo, ["rev-parse", "HEAD"])).toBe(featureHead);

    const merged = await runArcNoTty(["base", "merge", "--expected-base", newBase, "--json"], repo);
    expect(merged.exitCode).toBe(0);
    expect(JSON.parse(merged.stdout)).toMatchObject({ state: "merged", expectedBase: newBase });
    expect(await git(repo, ["merge-base", "--is-ancestor", featureHead, "HEAD"]).then(() => true)).toBe(true);
    expect(await git(repo, ["merge-base", "--is-ancestor", newBase, "HEAD"]).then(() => true)).toBe(true);
  });

  it("returns typed refusals for an unreadable config and a missing remote base", async () => {
    const { repo, newBase } = await fixture();
    const configPath = join(repo, ".arc/system/arc-config.yml");
    const config = await readFile(configPath, "utf8");

    await rm(configPath);
    const unreadable = await runArcNoTty(["base", "merge", "--expected-base", newBase, "--json"], repo);
    expect(unreadable.exitCode).toBe(1);
    expect(JSON.parse(unreadable.stdout)).toMatchObject({
      state: "blocked",
      reason: "operational-failure",
      expectedBase: newBase,
    });

    await writeFile(configPath, config.replace("branch.base: main", "branch.base: missing"), "utf8");
    const missing = await runArcNoTty(["base", "merge", "--expected-base", newBase, "--json"], repo);
    expect(missing.exitCode).toBe(1);
    expect(JSON.parse(missing.stdout)).toMatchObject({
      state: "blocked",
      reason: "operational-failure",
      expectedBase: newBase,
    });
  });
});
