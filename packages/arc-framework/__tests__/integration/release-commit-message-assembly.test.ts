/** Real-Git parity coverage for deterministic commit-message assembly. */

import { spawn } from "node:child_process";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo } from "../helpers/integration.js";
import {
  assembleCommitMessageParagraphs,
  cleanupCommitMessageBytes,
} from "../../src/lib/release/commit-message-assembly.js";
import { classifyCommitMessageInput } from "../../src/lib/release/commit-message-source.js";

interface GitResult {
  exitCode: number;
  stderr: string;
}

let repository = "";
let capturePath = "";

async function runGit(args: readonly string[], stdin?: Uint8Array): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: repository,
      env: { ...process.env, ARC_CAPTURE_PATH: capturePath, GIT_EDITOR: "false" },
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stderr }));
    child.stdin.end(stdin);
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  repository = await createTempRepo("arc-release-message-assembly-");
  capturePath = join(repository, "hook-message.bin");
  await writeFile(join(repository, "tracked.txt"), "tracked\n");
  await runGit(["add", "tracked.txt"]);
  await runGit(["commit", "-m", "initial"]);

  const hookPath = join(repository, ".git/hooks/commit-msg");
  await mkdir(join(repository, ".git/hooks"), { recursive: true });
  await writeFile(hookPath, ["#!/bin/sh", 'cp "$1" "$ARC_CAPTURE_PATH"', "exit 1", ""].join("\n"));
  await chmod(hookPath, 0o755);
});

afterEach(async () => {
  if (repository !== "") await cleanupTempDir(repository);
  repository = "";
  capturePath = "";
});

describe("assembled message parity", () => {
  it.each([
    {
      label: "repeated messages and whitespace cleanup",
      args: ["-m", "subject  \r\n", "-m", "body\n\n\nwith tail   "],
      values: ["subject  \r\n", "body\n\n\nwith tail   "],
    },
    { label: "separated combined options", args: ["-am", "subject"], values: ["subject"] },
    { label: "attached combined options", args: ["-amsubject"], values: ["subject"] },
    { label: "multi-member attached cluster", args: ["-qamsubject"], values: ["subject"] },
    {
      label: "quoting-sensitive content",
      args: ["--message=literal \\n $HOME $(command) 'single' \"double\""],
      values: ["literal \\n $HOME $(command) 'single' \"double\""],
    },
    {
      label: "option terminator",
      args: ["-m", "subject", "--", "tracked.txt"],
      values: ["subject"],
    },
  ])("matches hook-visible bytes for $label", async ({ args, values }) => {
    const commitArgs = ["--allow-empty", ...args];
    expect(
      classifyCommitMessageInput({ args: commitArgs, stdinIsTTY: false }),
    ).toMatchObject({ kind: "assembled" });

    const result = await runGit(["commit", ...commitArgs]);

    expect(result.exitCode).toBe(1);
    expect(Uint8Array.from(await readFile(capturePath))).toEqual(
      assembleCommitMessageParagraphs(values),
    );
  });

  it.each([
    { label: "file", path: "message.txt", stdin: undefined },
    { label: "stdin", path: "-", stdin: Buffer.from("subject  \n\n\nbody") },
  ])("matches hook-visible bytes for a $label source", async ({ path, stdin }) => {
    const source = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x0a, 0x0a, 0x0a, 0x62, 0x6f, 0x64, 0x79]);
    if (path !== "-") await writeFile(join(repository, path), source);
    const raw = stdin ?? source;
    const args = ["--allow-empty", "-F", path];
    expect(classifyCommitMessageInput({ args, stdinIsTTY: false })).toMatchObject({
      kind: "assembled",
    });

    const result = await runGit(["commit", ...args], stdin);

    expect(result.exitCode).toBe(1);
    expect(Uint8Array.from(await readFile(capturePath))).toEqual(cleanupCommitMessageBytes(raw));
  });
});

describe("Git-managed controls", () => {
  it.each([
    { args: ["-Smsecret"], encoding: undefined, expected: "unsupported-grammar" },
    { args: ["-m", "subject", "--cleanup=strip"], encoding: undefined, expected: "message-modifier" },
    { args: ["-m", "subject"], encoding: "iso-8859-1", expected: "unsupported-encoding" },
  ])("demotes $args without claiming byte parity", ({ args, encoding, expected }) => {
    expect(
      classifyCommitMessageInput({ args, stdinIsTTY: true, commitEncoding: encoding }),
    ).toEqual({ kind: "pass-through", reason: expected });
  });

  it.each([
    { args: ["--fixup=amend:HEAD"], expected: "refused", reachesHook: false },
    { args: ["--fixup=reword:HEAD"], expected: "refused", reachesHook: false },
    { args: ["--squash=HEAD"], expected: "refused", reachesHook: false },
    { args: ["--fixup=HEAD"], expected: "pass-through", reachesHook: true },
    { args: ["--squash=HEAD", "-m", "subject"], expected: "pass-through", reachesHook: true },
  ])("tracks Git's editor boundary for $args", async ({ args, expected, reachesHook }) => {
    expect(classifyCommitMessageInput({ args, stdinIsTTY: false })).toMatchObject({ kind: expected });

    const result = await runGit(["commit", "--allow-empty", ...args]);

    expect(result.exitCode).not.toBe(0);
    expect(await exists(capturePath)).toBe(reachesHook);
  });
});
