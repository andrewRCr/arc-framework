/** Public repository entry point for explicit-path worktree markdownlint. */

import { spawn } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { formatUnexpectedError } from "../lib/errors.js";
import { gitExec } from "../lib/io-context.js";
import { resolveMarkdownRepositoryRoot, runExplicitMarkdownlint, runWorktreeMarkdownlint } from "../lib/markdown/index.js";

function executeLinter(root: string, args: readonly string[]): Promise<number> {
  const command = process.platform === "win32" ? "markdownlint-cli2.cmd" : "markdownlint-cli2";
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => { resolve(code ?? 1); });
  });
}

/** Validate worktree configuration and run markdownlint over explicit selected paths. */
export async function main(cwd: string = process.cwd(), paths?: readonly string[]): Promise<number> {
  try {
    const root = await resolveMarkdownRepositoryRoot({ cwd, exec: gitExec, realpath });
    const options = {
      root,
      exec: gitExec,
      readText: (path: string) => readFile(path, "utf8"),
      executeLinter,
    };
    const result = paths === undefined
      ? await runWorktreeMarkdownlint(options)
      : await runExplicitMarkdownlint({ ...options, paths, lstat, realpath });
    return result.exitCode;
  } catch (error) {
    process.stderr.write(`${formatUnexpectedError(error)}\n`);
    return 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main();
