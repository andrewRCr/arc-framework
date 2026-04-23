/**
 * User command E2E tests.
 *
 * Exercises `arc user add`, save/load round-trip, error handling when
 * identity is missing, and the full push/pull portability contract
 * across cloned repositories.
 */

import { execFile } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** Check whether a path exists. */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Run a git command in a given directory. */
async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/** Init ARC and create an initial commit so git notes can attach.
 *  Bypasses hooks — these are scaffolding commits for test setup, not hook tests. */
async function initAndCommit(tmpDir: string): Promise<void> {
  const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
  expect(init.exitCode).toBe(0);
  await git(["add", "."], tmpDir);
  await git(["-c", "core.hooksPath=/dev/null", "commit", "-m", "initial commit"], tmpDir);
}

describe("user add", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("creates user directory with SESSION-NOTES.md", async () => {
    const result = await runArc(["user", "add", "alice"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(await pathExists(join(tmpDir, ".arc", "user", "alice"))).toBe(true);
    expect(await pathExists(join(tmpDir, ".arc", "user", "alice", "SESSION-NOTES.md"))).toBe(true);
  });

  it("with arc-in-git PM mode also creates ATOMIC-INBOX.md", async () => {
    // Re-init with arc-in-git so config reflects PM mode
    const tmpDir2 = await createTempRepo();

    try {
      const init = await runArc(
        ["init", "--yes", "--name", "test-project", "--pm-mode", "arc-in-git"],
        tmpDir2,
      );
      expect(init.exitCode).toBe(0);

      const result = await runArc(["user", "add", "bob"], tmpDir2);

      expect(result.exitCode).toBe(0);
      expect(await pathExists(join(tmpDir2, ".arc", "user", "bob", "SESSION-NOTES.md"))).toBe(true);
      expect(await pathExists(join(tmpDir2, ".arc", "user", "bob", "ATOMIC-INBOX.md"))).toBe(true);
    } finally {
      await cleanupTempDir(tmpDir2);
    }
  });
});

describe("user save/load", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("save/load round-trip: files restored after deletion", async () => {
    await initAndCommit(tmpDir);

    // User directory exists after init (SESSION-NOTES.md)
    const userDir = join(tmpDir, ".arc", "user", "test-user");
    expect(await pathExists(join(userDir, "SESSION-NOTES.md"))).toBe(true);

    // Save user directory to git note
    const save = await runArc(["user", "save"], tmpDir);
    expect(save.exitCode).toBe(0);
    const saveOutput = save.stdout + save.stderr;
    expect(saveOutput).toContain("Save");

    // Delete user directory
    await rm(userDir, { recursive: true, force: true });
    expect(await pathExists(userDir)).toBe(false);

    // Load user directory from git note
    const load = await runArc(["user", "load"], tmpDir);
    expect(load.exitCode).toBe(0);
    const loadOutput = load.stdout + load.stderr;
    expect(loadOutput).toContain("Load");

    // Files restored
    expect(await pathExists(join(userDir, "SESSION-NOTES.md"))).toBe(true);
  });

  it("save without identity exits non-zero", async () => {
    await initAndCommit(tmpDir);

    // Unset local arc.identity — user.name may still exist in global config,
    // so also isolate HOME to prevent fallback to global git config
    await git(["config", "--unset", "arc.identity"], tmpDir);
    await git(["config", "--unset", "user.name"], tmpDir);

    const result = await runArc(["user", "save"], tmpDir, {
      env: { HOME: tmpDir, GIT_CONFIG_NOSYSTEM: "1" },
    });

    expect(result.exitCode).not.toBe(0);
  });
});

describe("user status from a subdirectory", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    await initAndCommit(tmpDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("matches the repo-root result when invoked from a nested directory", async () => {
    const nestedDir = join(tmpDir, "nested", "deep");
    await mkdir(nestedDir, { recursive: true });

    const rootResult = await runArc(["user", "status", "--offline", "--json"], tmpDir);
    const nestedResult = await runArc(["user", "status", "--offline", "--json"], nestedDir);

    expect(rootResult.exitCode).toBe(0);
    expect(nestedResult.exitCode).toBe(0);
    expect(JSON.parse(nestedResult.stdout)).toEqual(JSON.parse(rootResult.stdout));
  });
});

describe("user push/pull portability", () => {
  let tmpDir: string;
  let bareDir: string;
  let cloneDir: string;
  const tempDirs: string[] = [];

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    tempDirs.push(tmpDir);
  });

  afterEach(async () => {
    for (const dir of tempDirs) {
      await cleanupTempDir(dir);
    }
    tempDirs.length = 0;
  });

  it("full portability: save → push → clone → pull → load restores files", async () => {
    await initAndCommit(tmpDir);

    // Save user directory to git note
    const save = await runArc(["user", "save"], tmpDir);
    expect(save.exitCode).toBe(0);

    // Create bare remote and add as origin
    bareDir = join(tmpDir, "..", "bare-remote.git");
    tempDirs.push(bareDir);
    await git(["init", "--bare", bareDir], tmpDir);
    await git(["remote", "add", "origin", bareDir], tmpDir);

    // Push commits and notes
    const branch = await git(["branch", "--show-current"], tmpDir);
    await git(["push", "origin", branch], tmpDir);
    const push = await runArc(["user", "push"], tmpDir);
    expect(push.exitCode).toBe(0);

    // Clone fresh repo from bare
    cloneDir = join(tmpDir, "..", "fresh-clone");
    tempDirs.push(cloneDir);
    await git(["clone", bareDir, cloneDir], tmpDir);

    // Configure identity in clone
    await git(["config", "arc.identity", "test-user"], cloneDir);

    // Pull user notes
    const pull = await runArc(["user", "pull"], cloneDir);
    expect(pull.exitCode).toBe(0);

    // Load user directory from note
    const load = await runArc(["user", "load"], cloneDir);
    expect(load.exitCode).toBe(0);

    // Verify files are present in the clone
    const userDir = join(cloneDir, ".arc", "user", "test-user");
    expect(await pathExists(join(userDir, "SESSION-NOTES.md"))).toBe(true);
  });
});
