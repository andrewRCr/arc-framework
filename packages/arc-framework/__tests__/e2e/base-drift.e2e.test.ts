/** `arc base drift` authoritative behavior in real repositories. */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, removeGitBackedDir, runArcNoTty } from "./helpers.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function fixture(advanceRemote: boolean): Promise<{
  repo: string;
  publisher: string;
  remote: string;
}> {
  const repo = await createTempRepo("arc-base-drift-");
  const publisher = await mkdtemp(join(tmpdir(), "arc-base-drift-publisher-"));
  const remote = await mkdtemp(join(tmpdir(), "arc-base-drift-remote-"));
  cleanup.push(repo, publisher, remote);
  expect((await runArcNoTty(["init", "--yes", "--name", "test-project"], repo)).exitCode).toBe(0);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "--no-verify", "-m", "init"]);
  await execFileAsync("git", ["init", "--bare", remote]);
  await git(repo, ["remote", "add", "origin", remote]);
  await git(repo, ["push", "-u", "origin", "main"]);
  await git(repo, ["switch", "-c", "feat/current"]);

  await execFileAsync("git", ["clone", "--branch", "main", remote, publisher]);
  await git(publisher, ["config", "user.email", "publisher@test.com"]);
  await git(publisher, ["config", "user.name", "Publisher"]);
  if (advanceRemote) {
    await writeFile(join(publisher, "remote.txt"), "advance\n", "utf8");
    await git(publisher, ["add", "remote.txt"]);
    await git(publisher, ["commit", "-m", "advance remote"]);
    await git(publisher, ["push", "origin", "main"]);
  }
  return { repo, publisher, remote };
}

afterEach(async () => {
  while (cleanup.length > 0) {
    const path = cleanup.pop();
    if (path === undefined) continue;
    if (path.includes("arc-base-drift-publisher-") || path.includes("arc-base-drift-remote-")) {
      await removeGitBackedDir(path);
    } else {
      await cleanupTempDir(path);
    }
  }
});

describe("arc base drift", () => {
  it("emits a clean JSON result and removes its invocation ref", async () => {
    const { repo } = await fixture(false);
    const run = await runArcNoTty(["base", "drift", "--json"], repo);
    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      mode: "authoritative", verdict: "clean", behind: 0, base: "main",
    });
    expect(await git(repo, ["for-each-ref", "--format=%(refname)", "refs/arc/base-drift/"])).toBe("");
  });

  it("emits reconcile as a valid reading even when advisory sync is disabled", async () => {
    const { repo } = await fixture(true);
    const configPath = join(repo, ".arc/system/arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("session.remote_sync: enabled", "session.remote_sync: disabled"));
    const run = await runArcNoTty(["base", "drift", "--json"], repo);
    expect(run.exitCode).toBe(0);
    const result = JSON.parse(run.stdout) as { verdict: string; behind: number; register: unknown };
    expect(result.verdict).toBe("reconcile");
    expect(result.behind).toBeGreaterThan(0);
    expect(result.register).not.toBeNull();
    expect(await git(repo, ["for-each-ref", "--format=%(refname)", "refs/arc/base-drift/"])).toBe("");
  });

  it("emits typed unavailable JSON and exit 1 without origin", async () => {
    const { repo } = await fixture(false);
    await git(repo, ["remote", "remove", "origin"]);
    const run = await runArcNoTty(["base", "drift", "--json"], repo);
    expect(run.exitCode).toBe(1);
    expect(JSON.parse(run.stdout)).toMatchObject({
      verdict: "unavailable", unavailableReason: "no-remote", baseOid: null,
    });
  });

  it("human rendering preserves the reconcile policy and exit status", async () => {
    const { repo } = await fixture(true);
    const run = await runArcNoTty(["base", "drift"], repo);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("Base reconciliation");
    expect(run.stdout).toContain("before integration");
  });

  it("rejects invalid base configuration before fetching", async () => {
    const { repo } = await fixture(false);
    const configPath = join(repo, ".arc/system/arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("branch.base: main", "branch.base: --upload-pack=x"));
    const run = await runArcNoTty(["base", "drift", "--json"], repo);
    expect(run.exitCode).toBe(1);
    expect(JSON.parse(run.stdout)).toMatchObject({
      verdict: "unavailable", unavailableReason: "invalid-base",
    });
  });
});
