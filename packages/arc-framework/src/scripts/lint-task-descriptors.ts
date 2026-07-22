/** Public repository entry point for worktree task descriptor validation. */

import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { formatUnexpectedError } from "../lib/errors.js";
import { gitExec } from "../lib/io-context.js";
import {
  resolveMarkdownRepositoryRoot,
  runWorktreeTaskDescriptorLint,
} from "../lib/markdown/index.js";

/** Run the worktree descriptor check and render every finding. */
export async function main(cwd: string = process.cwd()): Promise<number> {
  try {
    const root = await resolveMarkdownRepositoryRoot({ cwd, exec: gitExec, realpath });
    const result = await runWorktreeTaskDescriptorLint({
      root,
      exec: gitExec,
      readText: (path) => readFile(path, "utf8"),
    });
    for (const diagnostic of result.diagnostics) process.stderr.write(`${diagnostic.message}\n`);
    return result.diagnostics.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${formatUnexpectedError(error)}\n`);
    return 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main();
