/** Tracked-write lock paths, contention and caller recovery. */

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireAdvisoryLock, AdvisoryLockTimeoutError, releaseAdvisoryLock } from "../../../../src/lib/advisory-lock.js";
import { resolveCheckoutGitDir } from "../../../../src/lib/git/exec.js";
import { TRACKED_WRITE_LOCK_FILENAME, withTrackedWriteLock } from "../../../../src/lib/store/tracked-lock.js";
import { makeGitProcessError, scriptGitExec } from "../../../helpers/git-exec-fake.js";

let directory: string;
let gitDir: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "arc-tracked-lock-"));
  gitDir = join(directory, "private git dir");
  await mkdir(gitDir);
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
function executor(stdout: string) { return scriptGitExec([{ match: ["rev-parse", "--absolute-git-dir"], responses: [{ stdout }] }]).exec; }
async function exists(path: string): Promise<boolean> { return access(path).then(() => true, () => false); }

describe("tracked write lock", () => {
  it("holds a distinct lock in the checkout's own Git directory through the write", async () => {
    const path = join(gitDir, TRACKED_WRITE_LOCK_FILENAME);
    const expected = { written: true };
    const result = await withTrackedWriteLock({ exec: executor(`${gitDir}\n`), checkoutRoot: directory }, async (heldPath) => {
      expect(heldPath).toBe(path);
      expect(await exists(path)).toBe(true);
      await writeFile(join(directory, "record.md"), "new record");
      return expected;
    });
    expect(result).toBe(expected);
    expect(await readFile(join(directory, "record.md"), "utf8")).toBe("new record");
    expect(await exists(path)).toBe(false);
    expect(await exists(join(gitDir, "arc-worktree-operation.lock"))).toBe(false);
  });

  it("preserves a timed-out holder and record, then succeeds after that holder releases", async () => {
    const path = join(gitDir, TRACKED_WRITE_LOCK_FILENAME);
    const record = join(directory, "record.md");
    await writeFile(record, "old record");
    const holder = await acquireAdvisoryLock(path);
    let clock = 0;
    const context = { exec: executor(gitDir), checkoutRoot: directory, options: {
      now: () => clock, sleep: async (wait: number) => { clock += wait; }, maxWaitMs: 30,
    } };
    const write = () => withTrackedWriteLock(context, async () => { await writeFile(record, "new record"); return "written"; });
    let failure: unknown;
    try { await write(); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AdvisoryLockTimeoutError);
    expect(failure).toMatchObject({ lockPath: path, waitedMs: 30 });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ token: holder.token });
    expect(await readFile(record, "utf8")).toBe("old record");
    await releaseAdvisoryLock(holder);
    await expect(write()).resolves.toBe("written");
    expect(await readFile(record, "utf8")).toBe("new record");
    expect(await exists(path)).toBe(false);
  });
});

describe("checkout Git directory resolution", () => {
  it("returns the trimmed absolute path, including spaces", async () => {
    expect(await resolveCheckoutGitDir(executor(` ${gitDir}\n`), directory)).toBe(gitDir);
  });
  it("refuses an empty directory response", async () => {
    await expect(resolveCheckoutGitDir(executor("\n"), directory)).rejects.toThrow("--absolute-git-dir returned an empty path");
  });
  it("preserves execution failure instead of entering the write", async () => {
    const args = ["rev-parse", "--absolute-git-dir"];
    const evidence = { exitCode: 128, stderr: "fatal: not a git repository (or any of the parent directories): .git" };
    const exec = scriptGitExec([{ match: args, responses: [{ failure: evidence }] }]).exec;
    const expected = makeGitProcessError({ command: "git", args, ...evidence });
    let failure: unknown;
    try { await withTrackedWriteLock({ exec, checkoutRoot: directory }, async () => { await writeFile(join(directory, "record.md"), "record"); }); }
    catch (error) { failure = error; }
    expect(failure).toMatchObject({ kind: expected.kind, exitCode: expected.exitCode, stderr: expected.stderr });
    expect(await exists(join(directory, "record.md"))).toBe(false);
  });
});
