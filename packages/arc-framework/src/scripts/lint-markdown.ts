/** Ordered composition for repository worktree Markdown checks. */

import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { formatUnexpectedError } from "../lib/errors.js";
import { gitExec } from "../lib/io-context.js";
import type { GitExec } from "../lib/git/index.js";
import {
  findStagedMarkdownWorktreeDrift,
  formatStagedMarkdownWorktreeDriftMessage,
  resolveMarkdownRepositoryRoot,
} from "../lib/markdown/index.js";

const STAGES = ["lint:md:markdownlint", "lint:md:descriptors"] as const;

/** Run markdownlint before descriptor validation and stop at the first failure. */
export async function runMarkdownLintComposition(
  runStage: (stage: typeof STAGES[number]) => Promise<number>,
): Promise<number> {
  for (const stage of STAGES) {
    const exitCode = await runStage(stage);
    if (exitCode !== 0) return exitCode;
  }
  return 0;
}

/**
 * After a clean worktree composition, refuse a false-green when staged Markdown-gate
 * paths still differ in the worktree (index is what pre-commit certifies).
 */
export async function enforceStagedMarkdownWorktreeAlignment(
  cwd: string = process.cwd(),
  write: (message: string) => void = (message) => { process.stderr.write(`${message}\n`); },
): Promise<number> {
  try {
    const indexFile = process.env.GIT_INDEX_FILE;
    const indexedExec: GitExec = (command, args, options) => gitExec(command, args, { ...options, indexFile });
    const root = await resolveMarkdownRepositoryRoot({ cwd, exec: indexedExec, realpath });
    const drifted = await findStagedMarkdownWorktreeDrift({ root, exec: indexedExec });
    if (drifted.length === 0) return 0;
    write(formatStagedMarkdownWorktreeDriftMessage(drifted));
    return 1;
  } catch (error) {
    write(formatUnexpectedError(error));
    return 1;
  }
}

function runNpmStage(stage: typeof STAGES[number]): Promise<number> {
  const npmCli = process.env.npm_execpath;
  const command = npmCli === undefined ? "npm" : process.execPath;
  const args = npmCli === undefined ? ["run", "-s", stage] : [npmCli, "run", "-s", stage];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => { resolve(code ?? 1); });
  });
}

/** Run the public composed Markdown command, then refuse staged/worktree false-greens. */
export async function main(): Promise<number> {
  const exitCode = await runMarkdownLintComposition(runNpmStage);
  if (exitCode !== 0) return exitCode;
  return enforceStagedMarkdownWorktreeAlignment();
}

if (fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main();
