/**
 * E2E coverage for the installed commit-msg hook.
 *
 * Exercises real Git hook invocation against executable installed copies in
 * temporary repositories. The tests remain standalone and import only Node builtins.
 */

import { execFile, spawn } from "node:child_process";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const sourceHook = join(
  repositoryRoot,
  "packages/arc-framework/arc/system/.internal/githooks/commit-msg",
);
const sourceLibrary = join(
  repositoryRoot,
  "packages/arc-framework/arc/system/.internal/scripts/arc-lib.sh",
);

interface RepositoryFixture {
  capturePath: string;
  root: string;
}

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const repositories: string[] = [];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function createRepository(prefix = "arc-installed-commit-hook-"): Promise<RepositoryFixture> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  repositories.push(root);
  await execFileAsync("git", ["init", "-q", "-b", "main", root]);
  await git(["config", "user.email", "test@example.com"], root);
  await git(["config", "user.name", "Test User"], root);
  await writeFile(join(root, "initial.txt"), "initial\n");
  await git(["add", "initial.txt"], root);
  await git(["commit", "-m", "initial"], root);
  return { capturePath: join(root, "arc-invocation.txt"), root };
}

async function installHook(
  fixture: RepositoryFixture,
  config = "hooks.commit_msg: enabled\n",
): Promise<void> {
  const hook = join(fixture.root, ".arc/system/.internal/githooks/commit-msg");
  const library = join(fixture.root, ".arc/system/.internal/scripts/arc-lib.sh");
  const configPath = join(fixture.root, ".arc/system/arc-config.yml");
  await mkdir(dirname(hook), { recursive: true });
  await mkdir(dirname(library), { recursive: true });
  await copyFile(sourceHook, hook);
  await copyFile(sourceLibrary, library);
  await writeFile(configPath, config);
  await chmod(hook, 0o755);
  await chmod(library, 0o755);
  await git(["config", "core.hooksPath", ".arc/system/.internal/githooks"], fixture.root);
}

async function installFakeArc(
  path: string,
  exitCode: number,
  label = "delegated validator",
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, [
    "#!/bin/sh",
    "printf '%s\\n' \"$@\" > \"$ARC_TEST_CAPTURE\"",
    `echo "${label}"`,
    `exit ${exitCode}`,
    "",
  ].join("\n"));
  await chmod(path, 0o755);
}

async function runProcess(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProcessResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ exitCode: code ?? 1, stdout, stderr }));
  });
}

async function attemptCommit(
  fixture: RepositoryFixture,
  message: string,
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<ProcessResult> {
  const filename = `change-${Math.random().toString(16).slice(2)}.txt`;
  await writeFile(join(fixture.root, filename), "change\n");
  await git(["add", filename], fixture.root);
  return runProcess("git", ["commit", "-m", message], fixture.root, {
    ...process.env,
    ARC_TEST_CAPTURE: fixture.capturePath,
    NO_COLOR: "1",
    ...envOverrides,
  });
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("installed commit-msg gating", () => {
  it("skips disabled validation without resolving the CLI", async () => {
    const fixture = await createRepository();
    await installHook(fixture, "hooks.commit_msg: disabled\n");

    const result = await attemptCommit(fixture, "unrestricted message", {
      PATH: "/usr/bin:/bin",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).not.toContain("could not be resolved");
    expect(await exists(fixture.capturePath)).toBe(false);
  });

  it("skips a real merge commit without resolving the CLI", async () => {
    const fixture = await createRepository();
    await git(["checkout", "-b", "feature"], fixture.root);
    await writeFile(join(fixture.root, "feature.txt"), "feature\n");
    await git(["add", "feature.txt"], fixture.root);
    await git(["commit", "-m", "feature"], fixture.root);
    await git(["checkout", "main"], fixture.root);
    await writeFile(join(fixture.root, "main.txt"), "main\n");
    await git(["add", "main.txt"], fixture.root);
    await git(["commit", "-m", "main"], fixture.root);
    await installHook(fixture);

    const result = await runProcess(
      "git",
      ["merge", "--no-ff", "feature", "-m", "Merge feature"],
      fixture.root,
      { ...process.env, PATH: "/usr/bin:/bin", NO_COLOR: "1" },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).not.toContain("could not be resolved");
    expect(await exists(fixture.capturePath)).toBe(false);
  });

  it.each([0, 1, 2])("preserves delegated validator outcome %i during git commit", async (exitCode) => {
    const fixture = await createRepository();
    await installHook(fixture);
    await installFakeArc(join(fixture.root, "node_modules/.bin/arc"), exitCode);

    const result = await attemptCommit(fixture, "message validated by fake CLI");

    // Git maps every hook rejection to its own status 1; the installed hook's
    // exact status forwarding is covered at the direct executable boundary.
    expect(result.exitCode).toBe(exitCode === 0 ? 0 : 1);
    expect(result.stdout + result.stderr).toContain("delegated validator");
    expect((await readFile(fixture.capturePath, "utf8")).split("\n")).toEqual([
      "check",
      "commit-msg",
      expect.stringContaining("COMMIT_EDITMSG"),
      "",
    ]);
  });
});

describe("installed commit-msg CLI resolution", () => {
  it("prefers the repository-local CLI over a global executable", async () => {
    const fixture = await createRepository();
    const globalBin = join(fixture.root, "global-bin");
    await installHook(fixture);
    await installFakeArc(join(fixture.root, "node_modules/.bin/arc"), 0, "local validator");
    await installFakeArc(join(globalBin, "arc"), 1, "global validator");

    const result = await attemptCommit(fixture, "local validation wins", {
      PATH: `${globalBin}:/usr/bin:/bin`,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toContain("local validator");
    expect(result.stdout + result.stderr).not.toContain("global validator");
  });

  it("falls back to a global CLI when the repository has no local executable", async () => {
    const fixture = await createRepository();
    const globalBin = join(fixture.root, "global-bin");
    await installHook(fixture);
    await installFakeArc(join(globalBin, "arc"), 0, "global validator");

    const result = await attemptCommit(fixture, "global validation fallback", {
      PATH: `${globalBin}:/usr/bin:/bin`,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toContain("global validator");
  });

  it("fails closed with remediation when neither CLI path resolves", async () => {
    const fixture = await createRepository();
    await installHook(fixture);

    const result = await attemptCommit(fixture, "validation cannot run", {
      PATH: "/usr/bin:/bin",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("node_modules/.bin/arc");
    expect(result.stderr).toContain("GUI Git clients");
    expect(result.stderr).toContain("IDE-integrated commits");
    expect(result.stderr).toContain("version manager shims");
  });

  it("passes a spaced message path as one argument through the direct hook shape", async () => {
    const fixture = await createRepository("arc installed commit hook with spaces-");
    await installHook(fixture);
    await installFakeArc(join(fixture.root, "node_modules/.bin/arc"), 0);
    const messagePath = join(fixture.root, "message path with spaces.txt");
    await writeFile(messagePath, "direct spaced path validation\n");

    const result = await runProcess(
      join(fixture.root, ".arc/system/.internal/githooks/commit-msg"),
      [messagePath],
      fixture.root,
      { ...process.env, ARC_TEST_CAPTURE: fixture.capturePath, NO_COLOR: "1" },
    );

    expect(result.exitCode).toBe(0);
    const args = (await readFile(fixture.capturePath, "utf8")).trimEnd().split("\n");
    expect(args).toHaveLength(3);
    expect(args).toEqual(["check", "commit-msg", messagePath]);
  });

  it("passes a spaced message path as one argument through a hook-manager shape", async () => {
    const fixture = await createRepository("arc managed commit hook with spaces-");
    await installHook(fixture);
    await installFakeArc(join(fixture.root, "node_modules/.bin/arc"), 0);
    const managedHook = join(fixture.root, ".husky/commit-msg");
    await mkdir(dirname(managedHook), { recursive: true });
    await writeFile(managedHook, [
      "#!/bin/sh",
      '.arc/system/.internal/githooks/commit-msg "$1"',
      "",
    ].join("\n"));
    await chmod(managedHook, 0o755);
    const messagePath = join(fixture.root, "managed message path with spaces.txt");
    await writeFile(messagePath, "managed spaced path validation\n");

    const result = await runProcess(
      managedHook,
      [messagePath],
      fixture.root,
      { ...process.env, ARC_TEST_CAPTURE: fixture.capturePath, NO_COLOR: "1" },
    );

    expect(result.exitCode).toBe(0);
    const args = (await readFile(fixture.capturePath, "utf8")).trimEnd().split("\n");
    expect(args).toEqual(["check", "commit-msg", messagePath]);
  });
});
