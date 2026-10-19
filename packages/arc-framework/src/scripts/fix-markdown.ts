/** On-demand Markdown fixing over the validated Git-plus-projected lint corpus. */
import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { execa } from "execa";
import { formatUnexpectedError } from "../lib/errors.js";
import { createRawGitExec, gitExec } from "../lib/io-context.js";
import { ArcError } from "../lib/kernel/index.js";
import { readProjectedSelection, type ProjectedSelectionReader } from "../lib/checks/projected-selection.js";
import { runMarkdownFix } from "../lib/markdown/fix.js";
import { resolveMarkdownRepositoryRoot } from "../lib/markdown/selection.js";

async function execute(command: readonly string[], root: string): Promise<number> {
  const [program, ...args] = command;
  if (program === undefined) throw new Error("Markdown fixer command is empty");
  const result = await execa(program, args, { cwd: root, reject: false, stdio: "inherit" });
  return result.exitCode ?? 1;
}

/** Parse explicit/full requests and run the fixer with real file and process boundaries. */
export async function main(cwd = process.cwd(), args: readonly string[] = process.argv.slice(2),
  overrides: { readProjectedSelection?: ProjectedSelectionReader } = {}): Promise<number> {
  try {
    const { values, positionals } = parseArgs({ args: [...args], allowPositionals: true,
      options: { files: { type: "boolean", default: false } } });
    if (values.files && positionals.length === 0) {
      throw new ArcError("Explicit Markdown fixing requires at least one path", "markdown.empty-selection");
    }
    if (!values.files && positionals.length > 0) {
      throw new ArcError("Use lint:md:fix:file for explicit Markdown paths", "markdown.invalid-option");
    }
    const root = await resolveMarkdownRepositoryRoot({ cwd, exec: gitExec, realpath });
    const command = [join(root, "node_modules/.bin", process.platform === "win32" ? "markdownlint-cli2.cmd" : "markdownlint-cli2"),
      "--fix", "--no-globs", "--"];
    const result = await runMarkdownFix({ root, command, paths: values.files ? positionals : undefined,
      io: { exec: gitExec, rawGit: createRawGitExec(root), lstat, realpath, execute,
        readText: path => readFile(path, "utf8"), readProjectedSelection: overrides.readProjectedSelection ?? readProjectedSelection } });
    for (const skipped of result.skipped) process.stderr.write(`Skipped ${skipped.path}: ${skipped.reason}\n`);
    if (result.paths.length === 0) process.stdout.write("No Markdown files to fix.\n");
    return result.exitCode;
  } catch (error) {
    process.stderr.write(`${formatUnexpectedError(error)}\n`);
    return 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main();
