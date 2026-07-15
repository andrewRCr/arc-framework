/** Built-CLI coverage for release-commit preflight and Git hook ordering. */

import { execFile } from "node:child_process";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLI_PATH } from "../helpers/cli-spawn.js";
import { runCli } from "../helpers/run-cli.js";
import { cleanupTempDir, createTempRepo } from "./helpers.js";

const execFileAsync = promisify(execFile);

let repository = "";
let hookLog = "";

async function git(args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repository });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function installHook(name: string, lines: readonly string[]): Promise<void> {
  const path = join(repository, ".git", "hooks", name);
  await writeFile(path, ["#!/bin/sh", ...lines, ""].join("\n"));
  await chmod(path, 0o755);
}

async function readHookLog(): Promise<string[]> {
  try {
    return (await readFile(hookLog, "utf8")).trim().split("\n").filter(Boolean);
  } catch (cause: unknown) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return [];
    throw cause;
  }
}

async function installPrepareHook(): Promise<void> {
  await installHook("prepare-commit-msg", [
    'printf "%s\\n" prepare-commit-msg >> "$ARC_HOOK_LOG"',
    'case "$ARC_PREPARE_MODE" in',
    '  repair) printf "%s\\n" "feat(release): repair invalid input before validation" > "$1" ;;',
    '  invalidate) printf "%s\\n" short > "$1" ;;',
    "esac",
  ]);
}

beforeEach(async () => {
  repository = await createTempRepo("arc-release-commit-e2e-");
  hookLog = join(repository, "hook-order.log");
  await mkdir(join(repository, ".arc", "system"), { recursive: true });
  await writeFile(join(repository, ".arc", "system", "arc-config.yml"), [
    "branch.base: main",
    "branch.protection: partial",
    "hooks.commit_msg: enabled",
    "commit.format: conventional",
    "commit.context_footer: disabled",
    "commit.custom_pattern:",
    "commit.context_pattern:",
    "",
  ].join("\n"));
  await git(["config", "arc.commitInterlock", "on-task-approval"]);
  await writeFile(join(repository, "tracked.txt"), "initial\n");
  await git(["add", "tracked.txt"]);
  await git(["commit", "-m", "initial"]);
  await writeFile(join(repository, "tracked.txt"), "changed\n");
  await git(["add", "tracked.txt"]);

  await installHook("pre-commit", [
    'printf "%s\\n" pre-commit >> "$ARC_HOOK_LOG"',
  ]);
  await installHook("commit-msg", [
    'printf "%s\\n" commit-msg >> "$ARC_HOOK_LOG"',
    `exec node ${shellQuote(CLI_PATH)} check commit-msg "$1"`,
  ]);
});

afterEach(async () => {
  if (repository !== "") await cleanupTempDir(repository);
  repository = "";
  hookLog = "";
});

describe("release commit hook ordering", () => {
  it("refuses an invalid deterministic message before pre-commit", async () => {
    const result = await runCli(["release", "commit", "-m", "short"], {
      cwd: repository,
      env: { ARC_HOOK_LOG: hookLog },
    });

    expect(result.exitCode).toBe(16);
    expect(result.stderr).toContain("Commit validation FAILED");
    expect(await readHookLog()).toEqual([]);
  });

  it("retains Git's ordinary pre-commit then commit-msg order for a valid message", async () => {
    const result = await runCli([
      "release",
      "commit",
      "-m",
      "feat(release): preserve ordinary hook ordering",
    ], {
      cwd: repository,
      env: { ARC_HOOK_LOG: hookLog },
    });

    expect(result.exitCode).toBe(0);
    expect(await readHookLog()).toEqual(["pre-commit", "commit-msg"]);
  });

  it("lets prepare-commit-msg repair invalid input before the installed backstop", async () => {
    await installPrepareHook();

    const result = await runCli(["release", "commit", "-m", "short"], {
      cwd: repository,
      env: { ARC_HOOK_LOG: hookLog, ARC_PREPARE_MODE: "repair" },
    });

    expect(result.exitCode).toBe(0);
    expect(await readHookLog()).toEqual(["pre-commit", "prepare-commit-msg", "commit-msg"]);
  });

  it("lets commit-msg reject a passing message invalidated by prepare-commit-msg", async () => {
    await installPrepareHook();

    const result = await runCli([
      "release",
      "commit",
      "-m",
      "feat(release): begin with a valid deterministic message",
    ], {
      cwd: repository,
      env: { ARC_HOOK_LOG: hookLog, ARC_PREPARE_MODE: "invalidate" },
    });

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Commit validation FAILED");
    expect(await readHookLog()).toEqual(["pre-commit", "prepare-commit-msg", "commit-msg"]);
    await expect(access(join(repository, "tracked.txt"))).resolves.toBeUndefined();
  });
});
