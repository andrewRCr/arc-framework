/** Cross-consumer acceptance for the canonical commit-message fixtures. */

import { execFile, spawn } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { COMMIT_MESSAGE_FIXTURES } from "../fixtures/commit-msg/cases.js";
import { CLI_PATH } from "../helpers/cli-spawn.js";
import { runCli } from "../helpers/run-cli.js";
import { cleanupTempDir, createTempRepo } from "./helpers.js";

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

const matrixNames = [
  "valid conventional standalone",
  "missing design artifact warning",
  "invalid conventional type",
] as const;

const matrixFixtures = matrixNames.map((name) => {
  const fixture = COMMIT_MESSAGE_FIXTURES.find((candidate) => candidate.name === name);
  if (fixture === undefined) throw new Error(`missing cross-consumer fixture: ${name}`);
  return fixture;
});

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface JsonFinding {
  code: string;
}

interface JsonEnvelope {
  result: {
    kind: string;
    verdict?: string;
    findings?: JsonFinding[];
  };
}

let repository = "";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function git(args: readonly string[]): Promise<void> {
  await execFileAsync("git", [...args], { cwd: repository });
}

async function runProcess(command: string, args: readonly string[]): Promise<ProcessResult> {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(command, [...args], {
      cwd: repository,
      env: { ...process.env, NO_COLOR: "1" },
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

async function installCommitMessageConsumer(fixtureConfig: string): Promise<string> {
  const hook = join(repository, ".arc/system/.internal/githooks/commit-msg");
  const library = join(repository, ".arc/system/.internal/scripts/arc-lib.sh");
  const config = join(repository, ".arc/system/arc-config.yml");
  const localArc = join(repository, "node_modules/.bin/arc");

  await mkdir(dirname(hook), { recursive: true });
  await mkdir(dirname(library), { recursive: true });
  await mkdir(dirname(localArc), { recursive: true });
  await copyFile(sourceHook, hook);
  await copyFile(sourceLibrary, library);
  await writeFile(config, fixtureConfig);
  await writeFile(localArc, [
    "#!/bin/sh",
    `exec node ${shellQuote(CLI_PATH)} "$@"`,
    "",
  ].join("\n"));
  await chmod(hook, 0o755);
  await chmod(library, 0o755);
  await chmod(localArc, 0o755);
  await git(["config", "core.hooksPath", ".arc/system/.internal/githooks"]);
  await git(["config", "arc.commitInterlock", "on-task-approval"]);
  return hook;
}

async function setupFixture(fixtureConfig: string, messageBytes: Uint8Array): Promise<{
  hook: string;
  messagePath: string;
}> {
  repository = await createTempRepo("arc-commit-consumers-");
  await writeFile(join(repository, "tracked.txt"), "initial\n");
  await git(["add", "tracked.txt"]);
  await git(["commit", "-m", "initial"]);
  const hook = await installCommitMessageConsumer(fixtureConfig);
  const messagePath = join(repository, "message.txt");
  await writeFile(messagePath, messageBytes);
  await writeFile(join(repository, "tracked.txt"), "changed\n");
  await git(["add", "tracked.txt"]);
  return { hook, messagePath };
}

afterEach(async () => {
  if (repository !== "") await cleanupTempDir(repository);
  repository = "";
});

describe("commit-message consumer parity", () => {
  it.each(matrixFixtures)("matches findings and diagnostics for $name", async (fixture) => {
    const { hook, messagePath } = await setupFixture(fixture.config, fixture.messageBytes);

    const machine = await runCli(["check", "commit-msg", messagePath, "--json"], {
      cwd: repository,
      env: { NO_COLOR: "1" },
    });
    expect(machine.exitCode).toBe(fixture.expected.verdict === "fail" ? 1 : 0);
    const envelope = JSON.parse(machine.stdout) as JsonEnvelope;
    expect(envelope.result).toMatchObject({
      kind: "validated",
      verdict: fixture.expected.verdict,
    });
    expect(envelope.result.findings?.map(({ code }) => code)).toEqual(
      fixture.expected.findingCodes,
    );

    const human = await runCli(["check", "commit-msg", messagePath], {
      cwd: repository,
      env: { NO_COLOR: "1" },
    });
    const installedHook = await runProcess(hook, [messagePath]);
    expect(installedHook).toEqual(human);

    const wrapper = await runCli(["release", "commit", "-F", messagePath], {
      cwd: repository,
      env: { NO_COLOR: "1" },
    });
    const diagnostic = human.stdout.trimEnd();
    if (fixture.expected.verdict === "fail") {
      expect(wrapper.exitCode).toBe(16);
      expect(wrapper.stderr).toBe([
        diagnostic,
        "Refused: commit-message-preflight-failed (code 16)",
        "Commit-message preflight failed (validation).",
        "Correct the commit-message input and retry.",
        "Write the corrected message to a prepared file, then retry:",
        "arc release commit -F <message-file>",
        "",
      ].join("\n"));
    } else {
      expect(wrapper.exitCode).toBe(0);
      const wrapperOutput = `${wrapper.stdout}${wrapper.stderr}`;
      expect(wrapperOutput).toContain(diagnostic);
      expect(wrapperOutput.split(diagnostic)).toHaveLength(2);
    }

    expect(await readFile(messagePath)).toEqual(Buffer.from(fixture.messageBytes));
  });
});
