/** Project entry point for check-only exact-index Markdown certification. */

import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { lint } from "markdownlint/promise";

import { formatUnexpectedError } from "../lib/errors.js";
import { gitExec, readGitBlobBytes } from "../lib/io-context.js";
import {
  resolveMarkdownRepositoryRoot,
  runIndexedMarkdownCertification,
} from "../lib/markdown/index.js";
import { markdownRuntimeVersions } from "./verify-markdown-dependencies.js";

/** Certify the complete current Git index and render stable repository-relative findings. */
export async function main(cwd: string = process.cwd()): Promise<number> {
  try {
    const root = await resolveMarkdownRepositoryRoot({ cwd, exec: gitExec, realpath });
    const result = await runIndexedMarkdownCertification({
      root,
      exec: gitExec,
      readBlob: (repoRoot, path) => readGitBlobBytes(repoRoot, null, path),
      runtimeVersions: markdownRuntimeVersions(),
      lint,
    });
    for (const diagnostic of result.diagnostics) {
      process.stderr.write(`${diagnostic.message}\n`);
      if (diagnostic.remedy !== undefined) process.stderr.write(`  ${diagnostic.remedy}\n`);
    }
    return result.diagnostics.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${formatUnexpectedError(error)}\n`);
    return 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main();
