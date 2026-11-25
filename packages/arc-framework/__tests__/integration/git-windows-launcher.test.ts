import { execa } from "execa";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { gitExecutable } from "../../src/lib/git/executable.mjs";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";

const windows = process.platform === "win32";
const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("the Git executable a child process starts", () => {
  it.skipIf(windows)("is the bare name off Windows", () => {
    expect(gitExecutable(undefined)).toBe("git");
  });

  it.runIf(windows)("is Git for Windows' own binary from a stock PATH, whose hooks still run", async () => {
    const { systemDirectory, env } = await stockEnvironment();
    env.HOME = await temporaryDirectory();

    expect(gitExecutable(env)).toBe(win32.join(systemDirectory, "bin", "git.exe"));
    expect(await hookedCommit(env)).toBe(`${win32.basename(systemDirectory).toUpperCase()} /usr/bin/sed`);
  });

  it.runIf(windows)("stays the launcher when MSYSTEM is set, whose hooks still get Git's own system", async () => {
    const { systemDirectory, env } = await stockEnvironment();
    env.MSYSTEM = "MSYS";

    expect(gitExecutable(env)).toBe("git");
    expect(await hookedCommit(env)).toBe(`${win32.basename(systemDirectory).toUpperCase()} /usr/bin/sed`);
  });

  it.runIf(windows)("stays the launcher when the home has a bin, whose tools Git's own still precede", async () => {
    const { systemDirectory, env } = await stockEnvironment();
    env.HOME = await temporaryDirectory();
    await mkdir(join(env.HOME, "bin"));
    await writeFile(join(env.HOME, "bin", "sed"), "#!/bin/sh\necho shadowed\n");

    expect(gitExecutable(env)).toBe("git");
    expect(await hookedCommit(env)).toBe(`${win32.basename(systemDirectory).toUpperCase()} /usr/bin/sed`);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "arc-git-launcher-"));
  tempDirs.push(directory);
  return directory;
}

/** The environment of a stock Windows PATH holding only Git's launcher directory, without Git's own variables. */
async function stockEnvironment(): Promise<{ systemDirectory: string; env: NodeJS.ProcessEnv }> {
  const execPath = (await execa("git", ["--exec-path"])).stdout.trim();
  const systemDirectory = win32.resolve(execPath, "..", "..");
  const root = win32.dirname(systemDirectory);
  expect(existsSync(win32.join(root, "cmd", "git.exe"))).toBe(true);
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !/^(?:path|home|msystem|plink_protocol)$/iu.test(name)));
  env.Path = [win32.join(root, "cmd"), win32.join(systemRoot, "system32"), systemRoot].join(";");
  return { systemDirectory, env };
}

/** Commit through the executor in a new repository, returning the MSYSTEM and `sed` its pre-commit hook saw. */
async function hookedCommit(env: NodeJS.ProcessEnv): Promise<string> {
  const repo = await temporaryDirectory();
  const git = createExecaGitExec(undefined, env);
  await git("git", ["init", "-q"], { cwd: repo });
  await writeFile(join(repo, ".git", "hooks", "pre-commit"),
    "#!/bin/sh\nprintf '%s %s' \"$MSYSTEM\" \"$(command -v sed)\" > hook-ran\n");
  await git("git", ["-c", "core.hooksPath=.git/hooks", "-c", "user.name=ARC", "-c", "user.email=arc@example.invalid",
    "commit", "--allow-empty", "-q", "-m", "hooked"], { cwd: repo });
  return readFile(join(repo, "hook-ran"), "utf8");
}
