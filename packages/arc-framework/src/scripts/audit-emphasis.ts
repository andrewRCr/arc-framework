/** Public repository entry point for reproducible emphasis migration evidence. */

import { isMainModule } from "../lib/main-module.mjs";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

import { formatUnexpectedError } from "../lib/errors.js";
import { gitExec, readGitBlobBytes } from "../lib/io-context.js";
import { prepareEmphasisMigrationAudit, resolveMarkdownRepositoryRoot } from "../lib/markdown/index.js";

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  try {
    const root = await resolveMarkdownRepositoryRoot({ cwd: process.cwd(), exec: gitExec, realpath });
    const audit = await prepareEmphasisMigrationAudit({
      root,
      ...(args.length === 0 ? {} : { paths: args }),
      exec: gitExec,
      lstat,
      realpath,
      readBaseline: (ref, path) => readGitBlobBytes(root, ref, path),
      readBytes: (path) => readFile(join(root, ...path.split("/"))),
    });
    process.stdout.write(`baseline ${audit.head}\n`);
    for (const file of audit.files) {
      process.stdout.write(`${file.changedDelimiters === 0 ? "unchanged" : "audited"} ${file.path}`);
      process.stdout.write(file.changedDelimiters === 0 ? "\n" : ` ${file.changedDelimiters} delimiters\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${formatUnexpectedError(error)}\n`);
    return 1;
  }
}

if (await isMainModule(import.meta, process.argv[1])) process.exitCode = await main();
