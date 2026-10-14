/** Built-CLI refusals preserve local and remote commits for abbreviated destructive options. */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../helpers/run-cli.js";
import { cleanupTempDir, createTempRepo } from "./helpers.js";

const execFileAsync = promisify(execFile);
let repository = "";
let remote = "";

async function git(args: string[], cwd = repository): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

beforeEach(async () => {
  repository = await createTempRepo("arc-release-flag-prefixes-");
  await mkdir(join(repository, ".arc", "system"), { recursive: true });
  await writeFile(join(repository, ".arc", "system", "arc-config.yml"), [
    "branch.base: main",
    "branch.protection: partial",
    "commit.format: conventional",
    "commit.context_footer: disabled",
    "",
  ].join("\n"));
  await git(["config", "arc.commitInterlock", "on-task-approval"]);
  await git(["config", "arc.pushInterlock", "on-workflow"]);
  await writeFile(join(repository, "tracked.txt"), "initial\n");
  await git(["add", "tracked.txt"]);
  await git(["commit", "-m", "initial"]);
  await git(["checkout", "-b", "topic"]);
  remote = join(repository, ".git", "target.git");
  await git(["init", "--bare", "--initial-branch=main", remote]);
  await git(["remote", "add", "origin", remote]);
  await git(["push", "-u", "origin", "topic"]);
  await writeFile(join(repository, "tracked.txt"), "changed\n");
  await git(["add", "tracked.txt"]);
});

afterEach(async () => {
  if (repository !== "") await cleanupTempDir(repository);
  repository = "";
  remote = "";
});

describe("release wrapper abbreviated destructive flags", () => {
  it.each([
    { operation: "commit", option: "--no-verif", canonical: "--no-verify" },
    { operation: "commit", option: "--amen", canonical: "--amend" },
    { operation: "push", option: "--delet", canonical: "--delete" },
    { operation: "push", option: "--mirro", canonical: "--mirror" },
  ])("refuses $operation $option without changing either repository", async ({ operation, option, canonical }) => {
    const head = await git(["rev-parse", "HEAD"]);
    const remoteHead = await git(["rev-parse", "refs/heads/topic"], remote);
    const args = operation === "commit"
      ? ["release", operation, option, "-m", "fix(test): retain the staged change"]
      : ["release", operation, option];

    const result = await runCli(args, { cwd: repository });

    expect(result.exitCode).toBe(12);
    expect(result.stderr).toContain(canonical);
    expect(await git(["rev-parse", "HEAD"])).toBe(head);
    expect(await git(["rev-parse", "refs/heads/topic"], remote)).toBe(remoteHead);
    expect(await git(["diff", "--cached", "--name-only"])).toBe("tracked.txt");
  });
});
