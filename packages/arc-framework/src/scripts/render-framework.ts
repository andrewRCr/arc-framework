/** Public repository entry point for explicit installed Framework projection. */

import { isMainModule } from "../lib/main-module.mjs";
import { formatUnexpectedError } from "../lib/errors.js";
import { renderMarkdownWriteExecution, runMarkdownWriteCommand } from "./markdown-write-command.js";

const USAGE = [
  "Usage: npm run render:framework -- <package-source.md> [<package-source.md> ...]",
  "Paths must be tracked, installed Framework sources under packages/arc-framework/arc/ with existing .arc/ counterparts.",
].join("\n");

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  try {
    const execution = await runMarkdownWriteCommand("render-framework", process.cwd(), args);
    const rendered = renderMarkdownWriteExecution(execution);
    if (rendered.stdout !== "") process.stdout.write(`${rendered.stdout}\n`);
    if (rendered.stderr !== "") process.stderr.write(`${rendered.stderr}\n`);
    return execution.failure === undefined ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${formatUnexpectedError(error)}\n`);
    return 1;
  }
}

if (await isMainModule(import.meta, process.argv[1])) process.exitCode = await main();
