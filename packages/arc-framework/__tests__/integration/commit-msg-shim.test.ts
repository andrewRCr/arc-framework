/** Integration coverage for the installed commit-msg delegation shim. */

import { execFile, spawn } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const hookPath = join(repositoryRoot, "packages/arc-framework/arc/system/.internal/githooks/commit-msg");

interface HookFixture {
  capturePath: string;
  configPath: string;
  messagePath: string;
  root: string;
}

interface HookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const fixtures: string[] = [];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function createFixture(config = "hooks.commit_msg: enabled\n"): Promise<HookFixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-commit-shim-"));
  fixtures.push(root);
  const configPath = join(root, ".arc/system/arc-config.yml");
  const messagePath = join(root, ".git/COMMIT_EDITMSG");
  const capturePath = join(root, "arc-invocation.txt");
  await execFileAsync("git", ["init", "-q", root]);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, config);
  await writeFile(messagePath, "feat(hook): delegate message validation\n");
  return { capturePath, configPath, messagePath, root };
}

async function installFakeArc(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, [
    "#!/bin/sh",
    "printf '%s\\n' \"$@\" > \"$ARC_TEST_CAPTURE\"",
    "exit \"${ARC_TEST_EXIT:-0}\"",
    "",
  ].join("\n"));
  await chmod(path, 0o755);
}

async function installArcWithoutCheckVerb(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, [
    "#!/bin/sh",
    "echo \"error: unknown command 'check'\" >&2",
    "exit 1",
    "",
  ].join("\n"));
  await chmod(path, 0o755);
}

async function runHook(
  fixture: HookFixture,
  options: { exitCode?: number; path?: string } = {},
): Promise<HookResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("bash", [hookPath, fixture.messagePath], {
      cwd: fixture.root,
      env: {
        ...process.env,
        ARC_CONFIG_FILE: fixture.configPath,
        ARC_TEST_CAPTURE: fixture.capturePath,
        ARC_TEST_EXIT: String(options.exitCode ?? 0),
        NO_COLOR: "1",
        PATH: options.path ?? process.env.PATH,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ exitCode: code ?? 1, stdout, stderr }));
  });
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("commit-msg shim gating", () => {
  it("skips disabled validation without resolving the CLI", async () => {
    const fixture = await createFixture("hooks.commit_msg: disabled\n");
    await installFakeArc(join(fixture.root, "node_modules/.bin/arc"));

    const result = await runHook(fixture, { exitCode: 1 });

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(await exists(fixture.capturePath)).toBe(false);
  });

  it("skips merge validation without resolving the CLI", async () => {
    const fixture = await createFixture();
    await execFileAsync("git", ["-C", fixture.root, "config", "user.email", "test@example.com"]);
    await execFileAsync("git", ["-C", fixture.root, "config", "user.name", "Test User"]);
    await execFileAsync("git", ["-C", fixture.root, "commit", "--allow-empty", "-m", "initial"]);
    const { stdout } = await execFileAsync("git", ["-C", fixture.root, "rev-parse", "HEAD"]);
    await writeFile(join(fixture.root, ".git/MERGE_HEAD"), stdout);
    await installFakeArc(join(fixture.root, "node_modules/.bin/arc"));

    const result = await runHook(fixture, { exitCode: 1 });

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(await exists(fixture.capturePath)).toBe(false);
  });
});

describe("commit-msg shim CLI resolution", () => {
  it("prefers the repository-local CLI", async () => {
    const fixture = await createFixture();
    await installFakeArc(join(fixture.root, "node_modules/.bin/arc"));

    const result = await runHook(fixture);

    expect(result.exitCode).toBe(0);
    expect((await readFile(fixture.capturePath, "utf8")).split("\n")).toEqual([
      "check",
      "commit-msg",
      fixture.messagePath,
      "",
    ]);
  });

  it("falls back to a global CLI", async () => {
    const fixture = await createFixture();
    const bin = join(fixture.root, "global-bin");
    await installFakeArc(join(bin, "arc"));

    const result = await runHook(fixture, { path: `${bin}:${process.env.PATH ?? ""}` });

    expect(result.exitCode).toBe(0);
    expect(await readFile(fixture.capturePath, "utf8")).toContain("commit-msg\n");
  });

  it.each([0, 1, 2])("forwards delegated exit code %i", async (exitCode) => {
    const fixture = await createFixture();
    await installFakeArc(join(fixture.root, "node_modules/.bin/arc"));

    const result = await runHook(fixture, { exitCode });

    expect(result.exitCode).toBe(exitCode);
  });

  it("forwards the unknown-command failure from a CLI without the check verb", async () => {
    const fixture = await createFixture();
    await installArcWithoutCheckVerb(join(fixture.root, "node_modules/.bin/arc"));

    const result = await runHook(fixture);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unknown command 'check'");
  });

  it("fails closed with CLI resolution remediation", async () => {
    const fixture = await createFixture();

    const result = await runHook(fixture, { path: "/usr/bin:/bin" });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("node_modules/.bin/arc");
    expect(result.stderr).toContain("GUI");
    expect(result.stderr).toContain("IDE");
    expect(result.stderr).toContain("version manager");
  });
});
