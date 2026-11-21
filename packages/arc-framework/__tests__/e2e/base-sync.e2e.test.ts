/**
 * `arc base sync` E2E coverage.
 *
 * Exercises the destructive base-ref update through the built CLI in a real
 * repository with a linked worktree and a separately advanced remote.
 */

import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, removeGitBackedDir, runArcNoTty } from "./helpers.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

describe("arc base sync", () => {
  let primary: string;
  let linked: string;
  let publisher: string;
  let remote: string;

  beforeEach(async () => {
    primary = await createTempRepo("arc-base-sync-primary-");
    linked = `${primary}-linked`;
    publisher = await mkdtemp(join(tmpdir(), "arc-base-sync-publisher-"));
    remote = await mkdtemp(join(tmpdir(), "arc-base-sync-remote-"));

    const init = await runArcNoTty(["init", "--yes", "--name", "test-project"], primary);
    expect(init.exitCode).toBe(0);
    await git(primary, ["add", "."]);
    await git(primary, ["commit", "--no-verify", "-m", "init"]);

    await execFileAsync("git", ["init", "--bare", remote]);
    await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: remote });
    await git(primary, ["remote", "add", "origin", remote]);
    await git(primary, ["push", "-u", "origin", "main"]);

    await execFileAsync(
      "git",
      ["clone", "--config", "gc.auto=0", "--branch", "main", remote, publisher],
    );
    await git(publisher, ["config", "user.email", "publisher@test.com"]);
    await git(publisher, ["config", "user.name", "Publisher"]);
    await writeFile(join(publisher, "remote-change.txt"), "remote\n", "utf-8");
    await git(publisher, ["add", "remote-change.txt"]);
    await git(publisher, ["commit", "-m", "advance remote"]);
    await git(publisher, ["push", "origin", "main"]);

    await git(primary, ["branch", "feat/current"]);
    await git(primary, ["worktree", "add", linked, "feat/current"]);
  });

  afterEach(async () => {
    await git(primary, ["worktree", "remove", "--force", linked]).catch(() => "");
    await cleanupTempDir(primary);
    await removeGitBackedDir(publisher);
    await removeGitBackedDir(remote);
  });

  it("fast-forwards a clean checked-out base when invoked from a linked worktree", async () => {
    const before = await git(primary, ["rev-parse", "main"]);
    const remoteHead = await git(publisher, ["rev-parse", "HEAD"]);

    const result = await runArcNoTty(["base", "sync", "--json"], linked);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      status: "updated",
      method: "checked-out",
      base: "main",
      from: before,
      to: remoteHead,
      worktreePath: primary,
    });
    expect(await git(primary, ["rev-parse", "main"])).toBe(remoteHead);
    expect(await git(primary, ["rev-parse", "HEAD"])).toBe(remoteHead);
  });

  it("refuses a dirty checked-out base without moving its ref or files", async () => {
    const before = await git(primary, ["rev-parse", "main"]);
    const dirtyPath = join(primary, "local-dirty.txt");
    await writeFile(dirtyPath, "keep me\n", "utf-8");

    const result = await runArcNoTty(["base", "sync", "--json"], linked);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      status: "refused",
      reason: "dirty-base-worktree",
      base: "main",
      worktreePath: primary,
    });
    expect(await git(primary, ["rev-parse", "main"])).toBe(before);
    expect(await readFile(dirtyPath, "utf-8")).toBe("keep me\n");
  });

  it("updates only the ref when the base is not checked out", async () => {
    const before = await git(primary, ["rev-parse", "main"]);
    const remoteHead = await git(publisher, ["rev-parse", "HEAD"]);
    await git(primary, ["switch", "-c", "chore/coordination"]);
    await git(primary, ["commit", "--no-verify", "--allow-empty", "-m", "coordination work"]);
    const coordinationHead = await git(primary, ["rev-parse", "HEAD"]);
    await git(primary, ["tag", "main", coordinationHead]);

    const result = await runArcNoTty(["base", "sync", "--json"], linked);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      status: "updated",
      method: "managed-worktree",
      base: "main",
      from: before,
      to: remoteHead,
      worktreePath: null,
    });
    expect(await git(primary, ["rev-parse", "refs/heads/main"])).toBe(remoteHead);
    expect(await git(primary, ["rev-parse", "refs/tags/main"])).toBe(coordinationHead);
    expect(await git(primary, ["rev-parse", "HEAD"])).toBe(coordinationHead);
    expect(await git(primary, ["worktree", "list", "--porcelain"])).not.toContain("branch refs/heads/main");
    await expect(access(join(primary, "remote-change.txt"))).rejects.toThrow();
  });
});
