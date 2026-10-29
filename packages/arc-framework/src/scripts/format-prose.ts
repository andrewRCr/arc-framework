/** Public repository entry point for explicit Markdown prose rewrapping. */

import { fileURLToPath } from "node:url";
import { formatUnexpectedError } from "../lib/errors.js";
import { renderMarkdownWriteExecution, runMarkdownWriteCommand } from "./markdown-write-command.js";

/** Run an explicit formatting request and retain per-file write evidence. */
export async function main(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  try {
    if (args.includes("--help")) {
      process.stdout.write("Usage: npm run format:prose -- [--line <number>] <file.md>...\n"
        + "Whole-file runs rewrap only underfilled or overlong prose to the underwrap rule's width.\n"
        + "Use --line with one file to rewrap the paragraph at that line.\n");
      return 0;
    }
    const execution = await runMarkdownWriteCommand("format-prose", process.cwd(), args);
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
