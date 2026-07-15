/** Built-CLI coverage for release-commit preflight and Git hook ordering. */

import { execFile, spawn } from "node:child_process";
import { access, chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLI_PATH } from "../helpers/cli-spawn.js";
import { runCli } from "../helpers/run-cli.js";
import { cleanupTempDir, createTempRepo } from "./helpers.js";

const execFileAsync = promisify(execFile);

let repository = "";
let hookLog = "";
let arcBin = "";

async function git(args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repository });
}

async function gitOutput(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repository });
  return stdout.trim();
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

interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runShell(script: string, env: NodeJS.ProcessEnv = {}): Promise<ShellResult> {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn("/bin/sh", ["-c", script], {
      cwd: repository,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", rejectResult);
    child.on("close", (code) => resolveResult({
      exitCode: code ?? 1,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
}

async function installCapturingCommitMsgHook(): Promise<void> {
  await installHook("commit-msg", [
    'printf "%s\\n" commit-msg >> "$ARC_HOOK_LOG"',
    'cp "$1" "$ARC_MESSAGE_CAPTURE"',
    'if [ "${ARC_COMMIT_MSG_FAIL:-0}" = 1 ]; then exit 1; fi',
    `exec node ${shellQuote(CLI_PATH)} check commit-msg "$1"`,
  ]);
}

async function transientSnapshots(): Promise<string[]> {
  const gitDir = await gitOutput(["rev-parse", "--absolute-git-dir"]);
  return (await readdir(gitDir)).filter(
    (entry) => entry.startsWith(".arc-release-commit-message-")
      && entry !== ".arc-release-commit-message-retry",
  );
}

beforeEach(async () => {
  repository = await createTempRepo("arc-release-commit-e2e-");
  hookLog = join(repository, "hook-order.log");
  arcBin = join(repository, "test-bin");
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
  await mkdir(arcBin, { recursive: true });
  const arcShim = join(arcBin, "arc");
  await writeFile(arcShim, [
    "#!/bin/sh",
    `exec node ${shellQuote(CLI_PATH)} "$@"`,
    "",
  ].join("\n"));
  await chmod(arcShim, 0o755);
});

afterEach(async () => {
  if (repository !== "") await cleanupTempDir(repository);
  repository = "";
  hookLog = "";
  arcBin = "";
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

  it.runIf(process.platform !== "win32")(
    "leaves -F - stdin available to Git when validation is disabled",
    async () => {
      await writeFile(join(repository, ".arc", "system", "arc-config.yml"), [
        "branch.base: main",
        "branch.protection: partial",
        "hooks.commit_msg: disabled",
        "commit.format: conventional",
        "commit.context_footer: disabled",
        "",
      ].join("\n"));

      const result = await runShell([
        "arc release commit -F - <<'ARC_TEST_MESSAGE'",
        "unrestricted disabled message",
        "ARC_TEST_MESSAGE",
      ].join("\n"), {
        ARC_HOOK_LOG: hookLog,
        PATH: `${arcBin}:${process.env.PATH ?? ""}`,
      });

      expect(result.exitCode).toBe(0);
      expect(await gitOutput(["log", "-1", "--format=%B"])).toBe("unrestricted disabled message");
    },
  );

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

describe("release commit byte preservation", () => {
  it.runIf(process.platform !== "win32")(
    "replays quoted-heredoc bytes from the emitted retry path and removes it on success",
    async () => {
      await installCapturingCommitMsgHook();
      const firstCapture = join(repository, "first-message.bin");
      const secondCapture = join(repository, "second-message.bin");
      const message = [
        "feat(release): preserve interpolation-sensitive retry bytes",
        "",
        "literal $HOME $(printf injected) `printf command` 'single' \\backslash",
        "",
      ].join("\n");
      const env = {
        ARC_HOOK_LOG: hookLog,
        ARC_MESSAGE_CAPTURE: firstCapture,
        ARC_COMMIT_MSG_FAIL: "1",
        PATH: `${arcBin}:${process.env.PATH ?? ""}`,
      };
      const first = await runShell([
        "arc release commit -F - <<'ARC_TEST_MESSAGE'",
        message.trimEnd(),
        "ARC_TEST_MESSAGE",
      ].join("\n"), env);

      const expected = Buffer.from(message);
      const gitDir = await gitOutput(["rev-parse", "--absolute-git-dir"]);
      const retryPath = join(gitDir, ".arc-release-commit-message-retry");
      const retryCommand = first.stderr
        .split("\n")
        .find((line) => line.startsWith("arc release commit -F "));
      expect(first.exitCode).toBe(1);
      expect(retryCommand).toBeDefined();
      expect(await readFile(firstCapture)).toEqual(expected);
      expect(await readFile(retryPath)).toEqual(expected);

      const second = await runShell(retryCommand ?? "exit 99", {
        ...env,
        ARC_MESSAGE_CAPTURE: secondCapture,
        ARC_COMMIT_MSG_FAIL: "0",
      });

      expect(second.exitCode).toBe(0);
      expect(await readFile(secondCapture)).toEqual(expected);
      await expect(access(retryPath)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it.runIf(process.platform !== "win32")(
    "isolates file snapshots from caller mutation, inherits stdin, and cleans both outcomes",
    async () => {
      await installCapturingCommitMsgHook();
      const sourcePath = join(repository, "message source '$HOME;.txt");
      const hookCapture = join(repository, "file-message.bin");
      const stdinCapture = join(repository, "hook-stdin.txt");
      const message = Buffer.from([
        "feat(release): preserve captured file bytes",
        "",
        "literal $HOME $(printf injected) `printf command`",
        "",
      ].join("\n"));
      await writeFile(sourcePath, message);
      await installHook("pre-commit", [
        'if [ -e "/proc/$PPID/fd/0" ]; then readlink "/proc/$PPID/fd/0" > "$ARC_STDIN_CAPTURE"; fi',
        'printf "%s\\n" short > "$ARC_ORIGINAL_MESSAGE"',
      ]);
      const env = {
        ARC_HOOK_LOG: hookLog,
        ARC_MESSAGE_CAPTURE: hookCapture,
        ARC_STDIN_CAPTURE: stdinCapture,
        ARC_ORIGINAL_MESSAGE: sourcePath,
        ARC_COMMIT_MSG_FAIL: "0",
        PATH: `${arcBin}:${process.env.PATH ?? ""}`,
      };
      const success = await runShell(
        `printf '%s\\n' caller-stdin | arc release commit -F ${shellQuote(sourcePath)}`,
        env,
      );

      expect(success.exitCode).toBe(0);
      expect(await readFile(hookCapture)).toEqual(message);
      expect(await readFile(sourcePath, "utf8")).toBe("short\n");
      if (process.platform === "linux") {
        expect(await readFile(stdinCapture, "utf8")).toMatch(/^pipe:\[\d+\]\n$/u);
      }
      expect(await transientSnapshots()).toEqual([]);

      await writeFile(join(repository, "tracked.txt"), "changed again\n");
      await git(["add", "tracked.txt"]);
      await writeFile(sourcePath, message);
      const failure = await runShell(
        `printf '%s\\n' second-stdin | arc release commit -F ${shellQuote(sourcePath)}`,
        { ...env, ARC_COMMIT_MSG_FAIL: "1" },
      );

      expect(failure.exitCode).toBe(1);
      expect(await readFile(hookCapture)).toEqual(message);
      if (process.platform === "linux") {
        expect(await readFile(stdinCapture, "utf8")).toMatch(/^pipe:\[\d+\]\n$/u);
      }
      expect(await transientSnapshots()).toEqual([]);
    },
  );

  it("preserves Git's non-zero exit when retry persistence itself fails", async () => {
    await installCapturingCommitMsgHook();
    const gitDir = await gitOutput(["rev-parse", "--absolute-git-dir"]);
    await mkdir(join(gitDir, ".arc-release-commit-message-retry"));

    const result = await runCli([
      "release",
      "commit",
      "-m",
      "feat(release): preserve the original Git failure result",
    ], {
      cwd: repository,
      env: {
        ARC_HOOK_LOG: hookLog,
        ARC_MESSAGE_CAPTURE: join(repository, "failed-message.bin"),
        ARC_COMMIT_MSG_FAIL: "1",
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("latest commit-message retry could not be persisted");
    expect(result.stderr).not.toContain("arc release commit -F '");
  });
});
