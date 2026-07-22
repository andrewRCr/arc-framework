/** Public repository entry point for explicit GFM table formatting. */

import { fileURLToPath } from "node:url";

import { formatUnexpectedError } from "../lib/errors.js";
import { renderMarkdownWriteExecution, runMarkdownWriteCommand } from "./markdown-write-command.js";

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  try {
    const execution = await runMarkdownWriteCommand("format-tables", process.cwd(), args);
    const rendered = renderMarkdownWriteExecution(execution);
    if (rendered.stdout !== "") process.stdout.write(`${rendered.stdout}\n`);
    if (rendered.stderr !== "") process.stderr.write(`${rendered.stderr}\n`);
    return execution.failure === undefined ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${formatUnexpectedError(error)}\n`);
    return 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main();
