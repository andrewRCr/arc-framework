/** Operator-level coverage for work-unit rename across its three subject shapes. */

import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  createTempRepo,
  git,
  removeGitBackedDir,
  runArcNoTty,
} from "./helpers.js";

const execFileAsync = promisify(execFile);

interface RenameFixture {
  repo: string;
  remote: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function createFixture(): Promise<RenameFixture> {
  const repo = await createTempRepo("arc-rename-e2e-");
  const remote = await mkdtemp(join(tmpdir(), "arc-rename-origin-"));
  await execFileAsync("git", ["init", "--bare", remote]);
  await git(repo, ["remote", "add", "origin", remote]);
  const initialized = await runArcNoTty([
    "init", "--yes", "--name", "rename-test", "--pm-mode", "arc-in-git", "--tools", "codex",
  ], repo);
  expect(initialized.exitCode).toBe(0);
  await git(repo, ["config", "core.hooksPath", "/dev/null"]);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "chore(test): initialize fixture"]);
  await git(repo, ["push", "-u", "origin", "main"]);
  return { repo, remote };
}

async function startInPlace(fixture: RenameFixture): Promise<void> {
  await git(fixture.repo, ["switch", "-c", "feat/old-name"]);
  const started = await runArcNoTty([
    "start", "old-name", "--here", "--new", "--class", "Light", "--from", "internal",
  ], fixture.repo);
  expect(started.exitCode).toBe(0);
  await git(fixture.repo, ["add", "."]);
  await git(fixture.repo, ["commit", "-m", "chore(test): start work unit"]);
  await git(fixture.repo, ["push", "-u", "origin", "feat/old-name"]);
}

describe("arc rename", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    for (const path of cleanupPaths.splice(0).reverse()) await removeGitBackedDir(path);
  });

  it("renames a backlog stub on a short-lived branch and rests on main", async () => {
    const fixture = await createFixture();
    cleanupPaths.push(fixture.remote, fixture.repo);
    const stubbed = await runArcNoTty([
      "stub", "old-name", "--commitment", "planned", "--priority", "P2", "--class", "Light",
    ], fixture.repo);
    expect(stubbed.exitCode).toBe(0);
    await git(fixture.repo, ["add", "."]);
    await git(fixture.repo, ["commit", "-m", "chore(test): add work unit"]);
    await git(fixture.repo, ["push"]);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], fixture.repo);

    expect(renamed.exitCode).toBe(0);
    expect(renamed.stdout).toContain("pending integration");
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("main");
    const renamedMeta = await git(fixture.repo, [
      "show", "chore/rename-old-name-to-new-name:.arc/backlog/planned/new-name/meta-new-name.md",
    ]);
    expect(renamedMeta).toContain("# Metadata: new-name");
  }, 30_000);

  it("renames an in-place work unit, its notes workspace, and its published branch", async () => {
    const fixture = await createFixture();
    cleanupPaths.push(fixture.remote, fixture.repo);
    await startInPlace(fixture);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], fixture.repo);

    expect(renamed.exitCode).toBe(0);
    expect(renamed.stdout).toContain("in-place");
    expect(await git(fixture.repo, ["branch", "--show-current"])).toBe("feat/new-name");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/old-name"])).toBe("");
    expect(await git(fixture.repo, ["ls-remote", "--heads", "origin", "feat/new-name"])).not.toBe("");
    expect(await exists(join(fixture.repo, ".arc", "active", "meta-new-name.md"))).toBe(true);
  }, 30_000);

  it("self-renames a spawned worktree, marker, notes workspace, and remote branch", async () => {
    const fixture = await createFixture();
    const oldWorktree = `${fixture.repo}.old-name`;
    const newWorktree = `${fixture.repo}.new-name`;
    cleanupPaths.push(fixture.remote, fixture.repo, oldWorktree, newWorktree);
    const started = await runArcNoTty([
      "start", "old-name", "--new", "--class", "Light", "--from", "internal",
    ], fixture.repo, { timeout: 20_000 });
    expect(started.exitCode).toBe(0);

    const renamed = await runArcNoTty(["rename", "old-name", "new-name"], oldWorktree, { timeout: 20_000 });

    expect(renamed.exitCode).toBe(0);
    expect(renamed.stdout).toContain("spawned");
    expect(await exists(oldWorktree)).toBe(false);
    expect(await exists(newWorktree)).toBe(true);
    const marker = JSON.parse(await readFile(
      join(newWorktree, ".arc", "system", ".internal", "worktree-marker.json"),
      "utf8",
    )) as { wuName: string; createdFor: { name: string } };
    expect(marker.wuName).toBe("new-name");
    expect(marker.createdFor.name).toBe("new-name");
    expect(await git(newWorktree, ["branch", "--show-current"])).toBe("plan/new-name");
  }, 30_000);

  it("resumes after a stale remote lease without repeating completed identity legs", async () => {
    const fixture = await createFixture();
    const oldWorktree = `${fixture.repo}.old-name`;
    const newWorktree = `${fixture.repo}.new-name`;
    cleanupPaths.push(fixture.remote, fixture.repo, oldWorktree, newWorktree);
    const started = await runArcNoTty([
      "start", "old-name", "--new", "--class", "Light", "--from", "internal",
    ], fixture.repo, { timeout: 20_000 });
    expect(started.exitCode).toBe(0);
    const hook = join(fixture.remote, "hooks", "post-receive");
    await writeFile(hook, [
      "#!/bin/sh",
      "while read old new ref; do",
      "  if [ \"$ref\" = \"refs/heads/plan/new-name\" ] && [ ! -f arc-rename-fired ]; then",
      "    touch arc-rename-fired",
      "    git update-ref refs/heads/plan/old-name refs/heads/main",
      "  fi",
      "done",
      "",
    ].join("\n"), "utf8");
    await chmod(hook, 0o755);

    const interrupted = await runArcNoTty(["rename", "old-name", "new-name"], oldWorktree, { timeout: 20_000 });

    expect(interrupted.exitCode).toBe(1);
    expect(interrupted.stdout + interrupted.stderr).toContain("old remote head moved");
    expect(await exists(oldWorktree)).toBe(true);
    expect(await git(oldWorktree, ["branch", "--show-current"])).toBe("plan/new-name");

    const resumed = await runArcNoTty(["rename", "old-name", "new-name"], oldWorktree, { timeout: 20_000 });
    expect(resumed.exitCode, resumed.stdout + resumed.stderr).toBe(0);
    expect(await exists(oldWorktree)).toBe(false);
    expect(await exists(newWorktree)).toBe(true);
    expect(await git(newWorktree, ["ls-remote", "--heads", "origin", "plan/old-name"])).toBe("");
  }, 45_000);
});
