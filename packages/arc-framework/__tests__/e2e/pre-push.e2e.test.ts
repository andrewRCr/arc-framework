/**
 * E2E: pre-push force-push advisory hook.
 *
 * Exercises the canonical hook script against real temp git repositories — real
 * OIDs, real `merge-base` ancestry — by invoking it directly with the git
 * pre-push stdin protocol (`<local_ref> <local_oid> <remote_ref> <remote_oid>`).
 * Asserts the advisory fires on a non-ancestor force-push, stays silent on a
 * fast-forward, and does not block when no CLI dispatches.
 *
 * Standalone — imports only node builtins, not CLI source.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { removeGitBackedDir } from "../helpers/temp-repo.js";
import { restrictedGitPath } from "../helpers/restricted-git-path.js";

const execFileAsync = promisify(execFile);

// __tests__/e2e/ → repo root is four levels up.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const HOOK_PATH = join(REPO_ROOT, ".arc/system/.internal/githooks/pre-push");

const ZERO = "0000000000000000000000000000000000000000";

interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Invoke the pre-push hook with a stdin protocol line; capture output + exit. */
async function runHook(
  cwd: string,
  stdinLine: string,
  args: string[] = ["origin", "."],
  environment: NodeJS.ProcessEnv = {},
): Promise<HookResult> {
  const restrictedPath = await restrictedGitPath(cwd);
  return new Promise((resolvePromise, reject) => {
    const child = spawn("bash", [HOOK_PATH, ...args], {
      cwd,
      env: { ...process.env, ...environment, PATH: restrictedPath, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ stdout, stderr, exitCode: code ?? 0 }));
    child.stdin.write(stdinLine);
    child.stdin.end();
  });
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "arc-prepush-"));
  await execFileAsync("git", ["init", "-b", "feature", dir]);
  await git(["config", "gc.auto", "0"], dir);
  await git(["config", "user.email", "test@test.com"], dir);
  await git(["config", "user.name", "Test User"], dir);
  return dir;
}

async function commit(dir: string, content: string): Promise<string> {
  await execFileAsync("bash", ["-c", `printf '%s\\n' '${content}' >> f.txt`], { cwd: dir });
  await git(["add", "f.txt"], dir);
  await git(["commit", "-m", content], dir);
  return git(["rev-parse", "HEAD"], dir);
}

let repos: string[] = [];

beforeAll(() => {
  // The hook must be present in the canonical location for this suite to mean anything.
  expect(HOOK_PATH).toContain(".arc/system/.internal/githooks/pre-push");
});

afterEach(async () => {
  await Promise.all(repos.map((d) => removeGitBackedDir(d)));
  repos = [];
});

describe("pre-push force-push advisory hook", () => {
  it("warns on a non-ancestor force-push without CLI dispatch", async () => {
    const dir = await makeRepo();
    repos.push(dir);

    const base = await commit(dir, "a");
    const remoteTip = await commit(dir, "b"); // the published remote tip
    // Rebase: drop b, land a different commit on base — the new local tip.
    await git(["reset", "--hard", base], dir);
    const localTip = await commit(dir, "b-rebased");

    const result = await runHook(
      dir,
      `refs/heads/feature ${localTip} refs/heads/feature ${remoteTip}\n`,
    );

    expect(result.exitCode).toBe(0); // advisory — never blocks
    expect(result.stderr).toContain("force-push rewrites published history");
    expect(result.stderr).toContain("feature");
    expect(result.stderr).toContain("1 commit(s)"); // exactly the dropped remote tip
    expect(result.stderr).toContain("Advisory");
  });

  it("stays silent on a fast-forward push", async () => {
    const dir = await makeRepo();
    repos.push(dir);

    const remoteTip = await commit(dir, "a");
    const localTip = await commit(dir, "b"); // fast-forward: remote is an ancestor

    const result = await runHook(
      dir,
      `refs/heads/feature ${localTip} refs/heads/feature ${remoteTip}\n`,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });

  it("stays silent for a brand-new remote branch (all-zero remote oid)", async () => {
    const dir = await makeRepo();
    repos.push(dir);

    const localTip = await commit(dir, "a");

    const result = await runHook(
      dir,
      `refs/heads/feature ${localTip} refs/heads/feature ${ZERO}\n`,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("disables the advisory when hooks.pre_push is disabled", async () => {
    const dir = await makeRepo();
    repos.push(dir);

    const base = await commit(dir, "a");
    const remoteTip = await commit(dir, "b");
    await git(["reset", "--hard", base], dir);
    const localTip = await commit(dir, "b-rebased");

    // A minimal config that turns the hook off, pointed at via ARC_CONFIG_FILE.
    await execFileAsync("bash", [
      "-c",
      `mkdir -p .arc/system && printf 'hooks.pre_push: disabled\\n' > .arc/system/arc-config.yml`,
    ], { cwd: dir });

    const restrictedPath = await restrictedGitPath(dir);
    const result = await new Promise<HookResult>((resolvePromise, reject) => {
      const child = spawn("bash", [HOOK_PATH, "origin", "."], {
        cwd: dir,
        env: { ...process.env, PATH: restrictedPath, NO_COLOR: "1" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("error", reject);
      child.on("close", (code) => resolvePromise({ stdout, stderr, exitCode: code ?? 0 }));
      child.stdin.write(`refs/heads/feature ${localTip} refs/heads/feature ${remoteTip}\n`);
      child.stdin.end();
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });
});


it.each(["state", "deletion", "empty"])("permits a %s event with a declaration and no CLI", async kind => {
  const root = await makeRepo();
  repos.push(root);
  const tip = await commit(root, "base");
  await mkdir(join(root, ".arc/system"), { recursive: true });
  await writeFile(join(root, ".arc/system/arc-checks.yml"), "checks: {}\n");
  const line = kind === "state" ? `refs/arc/state ${tip} refs/arc/state ${ZERO}\n`
    : kind === "deletion" ? `(delete) ${ZERO} refs/heads/old ${tip}\n` : "";
  const result = await runHook(root, line);
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  const mixed = await runHook(root, line + `refs/heads/feature ${tip} refs/heads/feature ${ZERO}\n`);
  expect(mixed.exitCode, mixed.stdout + mixed.stderr).toBe(1);
  expect(mixed.stderr).toContain("ARC CLI could not be resolved");
});


it.each(["state", "deletion"])("permits a native pre-commit.com %s event with no CLI", async kind => {
  const root = await makeRepo();
  repos.push(root);
  const tip = await commit(root, "base");
  await mkdir(join(root, ".arc/system"), { recursive: true });
  await writeFile(join(root, ".arc/system/arc-checks.yml"), "checks: {}\n");
  const environment = { PRE_COMMIT_LOCAL_BRANCH: kind === "state" ? "refs/arc/state" : "refs/heads/feature",
    PRE_COMMIT_FROM_REF: tip, PRE_COMMIT_TO_REF: kind === "state" ? tip : ZERO };
  const result = await runHook(root, "", ["origin", "."], environment);
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
});
