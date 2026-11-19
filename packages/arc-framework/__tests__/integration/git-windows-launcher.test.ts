import { execa } from "execa";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    const execPath = (await execa("git", ["--exec-path"])).stdout.trim();
    const systemDirectory = win32.resolve(execPath, "..", "..");
    const root = win32.dirname(systemDirectory);
    expect(existsSync(win32.join(root, "cmd", "git.exe"))).toBe(true);
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env)
      .filter(([name]) => !/^(?:path|home|msystem|plink_protocol)$/iu.test(name)));
    env.Path = [win32.join(root, "cmd"), win32.join(systemRoot, "system32"), systemRoot].join(";");

    expect(gitExecutable(env)).toBe(win32.join(systemDirectory, "bin", "git.exe"));

    const repo = await mkdtemp(join(tmpdir(), "arc-git-launcher-"));
    tempDirs.push(repo);
    const git = createExecaGitExec(undefined, env);
    await git("git", ["init", "-q"], { cwd: repo });
    await writeFile(join(repo, ".git", "hooks", "pre-commit"), "#!/bin/sh\nprintf '%s' \"$MSYSTEM\" > hook-ran\n");
    await git("git", ["-c", "core.hooksPath=.git/hooks", "-c", "user.name=ARC", "-c", "user.email=arc@example.invalid",
      "commit", "--allow-empty", "-q", "-m", "hooked"], { cwd: repo });

    expect(await readFile(join(repo, "hook-ran"), "utf8")).toBe(win32.basename(systemDirectory).toUpperCase());
  });
});
