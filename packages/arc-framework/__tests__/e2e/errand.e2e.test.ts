/**
 * `arc errand check` E2E.
 *
 * Exercises the built CLI end-to-end: `arc errand check` reports which in-flight
 * work units touch the target path(s), emitting the overlap facts as JSON for
 * skill consumption. This covers the real path resolution that unit tests stub.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** Run a git command in `cwd` and return its stdout. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
}

describe("arc errand check", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("reports no overlap as JSON when no other work unit is in flight", async () => {
    const result = await runArc(
      ["errand", "check", "--target", "docs/x.md", "--json"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);
    // `reachable` reflects the oracle's remote read; the sandbox repo has no
    // reachable remote, so the no-overlap result carries `reachable: false`.
    expect(JSON.parse(result.stdout.trim())).toEqual({ overlaps: [], reachable: false });
  });
});

describe("arc errand cut", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    // The base (`main`) needs a tip to fork from. `--no-verify` skips the
    // project hooks `arc init` installs (the fixture message is not under test).
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("cuts chore/<slug> off branch.base, at the base's tip", async () => {
    const result = await runArc(["errand", "cut", "fix-typo"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(await git(tmpDir, ["branch", "--list", "chore/fix-typo"])).toContain("chore/fix-typo");
    const choreSha = (await git(tmpDir, ["rev-parse", "chore/fix-typo"])).trim();
    const mainSha = (await git(tmpDir, ["rev-parse", "main"])).trim();
    expect(choreSha).toBe(mainSha);
  });

  it("is a no-clobber no-op when the branch already exists — the ref is not moved", async () => {
    await runArc(["errand", "cut", "fix-typo"], tmpDir);
    const before = (await git(tmpDir, ["rev-parse", "chore/fix-typo"])).trim();
    // Advance the base; a force-create would move the errand branch onto the new tip.
    await git(tmpDir, ["commit", "--allow-empty", "--no-verify", "-m", "second"]);

    const result = await runArc(["errand", "cut", "fix-typo"], tmpDir);

    expect(result.exitCode).toBe(0);
    const after = (await git(tmpDir, ["rev-parse", "chore/fix-typo"])).trim();
    expect(after).toBe(before);
    expect(after).not.toBe((await git(tmpDir, ["rev-parse", "main"])).trim());
  });
});
