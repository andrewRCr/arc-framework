/** Scratch repositories and built-CLI invocations for checkout and inbox operations. */
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, onTestFinished } from "vitest";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { cleanupTempDir, git, runArcNoTty, runArcWithStdin, type RunResult } from "../e2e/helpers.js";
import { createTempRepoCore } from "./temp-repo.js";

export const identity = SlugSchema.parse("test-user");
const person = OwnerIdentitySchema.parse({ type: "person", name: identity });
const project = OwnerIdentitySchema.parse({ type: "project", name: "project" });
export const personalInbox = recordReferences["personal/inbox"](person);
export const projectInbox = recordReferences["project-inbox/inbox"](project);
export const errandQueue = recordReferences["personal/errand-queue"](person);
export const projectInboxRef = "refs/arc/project/inbox";
export const personalRef = `refs/arc/user/${identity}/personal`;

/** Run a public command and retain its complete diagnostic when the exit status differs. */
export async function invoke(cwd: string, args: string[], exitCode = 0,
  options?: { stdin?: string; env?: NodeJS.ProcessEnv }): Promise<RunResult> {
  const argv = ["--no-input", ...args];
  const settings = { env: { FORCE_COLOR: undefined, ...options?.env } };
  const result = options?.stdin === undefined
    ? await runArcNoTty(argv, cwd, settings)
    : await runArcWithStdin(argv, cwd, options.stdin, settings);
  expect(result.exitCode, `arc ${argv.join(" ")}\n${result.stdout}${result.stderr}`).toBe(exitCode);
  return result;
}

/** Initialize a repository with the production store and an optional local state remote. */
export async function repository(fullProtection = false): Promise<string> {
  const temporary = await createTempRepoCore({ prefix: "arc-occupancy-inbox-", identity, refFormat: "files" });
  onTestFinished(() => cleanupTempDir(temporary));
  const root = await realpath(temporary);
  await invoke(root, ["init", "--name", "field-notes", "--identity", identity, "--tools", ""]);
  const config = join(root, ".arc", "system", "arc-config.yml");
  const settings = (await readFile(config, "utf8"))
    .replace(/^session\.remote_sync:.*$/mu, "session.remote_sync: disabled")
    .replace("branch.protection: partial", fullProtection ? "branch.protection: full" : "branch.protection: partial");
  await writeFile(config, settings);
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "chore: initialize scratch project"]);
  if (fullProtection) {
    const origin = join(root, ".git", "test-origin.git");
    await git(root, ["init", "--bare", "--initial-branch=main", origin]);
    await git(root, ["remote", "add", "origin", origin]);
    await git(root, ["push", "-u", "origin", "main"]);
    await invoke(root, ["store", "remote", "origin", "push"]);
  }
  return root;
}

/** Locate the physical repository that holds state refs. */
export async function stateDirectory(root: string): Promise<string> {
  const common = join(root, ".git");
  const separate = join(common, "arc", "store");
  try {
    return (await stat(separate)).isDirectory() ? separate : common;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return common;
    throw error;
  }
}

/** Read the real state refs and objects through Git. */
export async function stateGit(root: string, args: string[]): Promise<string> {
  return git(root, [`--git-dir=${await stateDirectory(root)}`, ...args]);
}

/** Read durable state and code refs to detect a partially landed command. */
export async function refSnapshot(root: string): Promise<string[]> {
  const args = ["for-each-ref", "--format=%(refname) %(objectname)"];
  return Promise.all([
    stateGit(root, [...args, "refs/arc/project", "refs/arc/user", "refs/arc/work", "refs/arc/history"]),
    git(root, [...args, "refs/heads", "refs/remotes"]),
  ]);
}

/** Run one fixture action at a native Git call and forward every invocation to real Git. */
export async function interruptGit(root: string, action: string[], environment: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
  const bin = join(root, ".git", "test-bin");
  await mkdir(bin);
  await writeFile(join(bin, "git"), [
    "#!/bin/sh",
    'PATH="$ARC_TEST_GIT_PATH"; export PATH',
    ...action,
    'exec git "$@"',
    "",
  ].join("\n"), { mode: 0o755 });
  return { ...environment, ARC_TEST_GIT_PATH: process.env.PATH, PATH: `${bin}:${process.env.PATH ?? ""}` };
}
