/**
 * E2E: commit-msg merge-commit exemption.
 *
 * Exercises the canonical hook script against real temp git repositories. A merge
 * in progress carries MERGE_HEAD; git invokes commit-msg on the merge as it does
 * any commit, but the auto-generated merge message follows no conventional format
 * and has no Context: footer. Asserts the hook short-circuits to exit 0 when
 * MERGE_HEAD is present, and still validates ordinary (non-merge) commits.
 *
 * Standalone — imports only node builtins, not CLI source.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// __tests__/e2e/ → repo root is four levels up.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const HOOK_PATH = join(REPO_ROOT, ".arc/system/.internal/githooks/commit-msg");

interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Write a commit message to a file and invoke the hook against it. */
async function runHook(cwd: string, message: string): Promise<HookResult> {
  const msgPath = join(cwd, ".git", "ARC_TEST_MSG");
  await writeFile(msgPath, message);
  return new Promise((resolvePromise, reject) => {
    const child = spawn("bash", [HOOK_PATH, msgPath], {
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ stdout, stderr, exitCode: code ?? 0 }));
  });
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "arc-commitmsg-"));
  await execFileAsync("git", ["init", "-b", "main", dir]);
  await git(["config", "user.email", "test@test.com"], dir);
  await git(["config", "user.name", "Test User"], dir);
  return dir;
}

/** Commit a single file with its own content — distinct files merge cleanly. */
async function commit(dir: string, file: string, content: string): Promise<string> {
  await writeFile(join(dir, file), `${content}\n`);
  await git(["add", file], dir);
  await git(["commit", "-m", `chore(test): add ${file}\n\nContext: standalone (maintenance)`], dir);
  return git(["rev-parse", "HEAD"], dir);
}

let repos: string[] = [];

beforeAll(() => {
  // The hook must be present in the canonical location for this suite to mean anything.
  expect(HOOK_PATH).toContain(".arc/system/.internal/githooks/commit-msg");
});

afterEach(async () => {
  await Promise.all(repos.map((d) => rm(d, { recursive: true, force: true })));
  repos = [];
});

describe("commit-msg merge-commit exemption", () => {
  it("exempts a real merge-in-progress (MERGE_HEAD present) — exit 0, no validation", async () => {
    const dir = await makeRepo();
    repos.push(dir);

    await commit(dir, "base.txt", "base");
    await git(["checkout", "-b", "feature"], dir);
    await commit(dir, "feature.txt", "feature work");
    await git(["checkout", "main"], dir);
    await commit(dir, "main.txt", "main work");

    // Divergent histories touching distinct files → clean automatic merge.
    // --no-commit stops just before the merge commit, leaving MERGE_HEAD set.
    await execFileAsync("git", ["merge", "--no-ff", "--no-commit", "feature"], { cwd: dir });
    await git(["rev-parse", "--verify", "MERGE_HEAD"], dir); // sanity: merge is in progress

    // git's auto-merge subject ("Merge branch 'feature'") would fail conventional
    // format and the Context: footer rule — the exemption must short-circuit it.
    const result = await runHook(dir, "Merge branch 'feature'");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(""); // short-circuits before "Validating commit message..."
    expect(result.stderr).toBe("");
  });

  it("still validates an ordinary commit — well-formed message passes", async () => {
    const dir = await makeRepo();
    repos.push(dir);
    await commit(dir, "base.txt", "base");

    const result = await runHook(
      dir,
      "feat(hook): add a thing\n\nContext: standalone (maintenance)",
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Validating commit message...");
    expect(result.stdout).toContain("PASSED");
  });

  it("still validates an ordinary commit — malformed subject is rejected", async () => {
    const dir = await makeRepo();
    repos.push(dir);
    await commit(dir, "base.txt", "base");

    const result = await runHook(dir, "not a conventional subject");

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Conventional Commits format");
  });
});
