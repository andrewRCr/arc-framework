/** Project entry point for check-only exact-index Markdown certification. */

import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { formatUnexpectedError } from "../lib/errors.js";
import { gitExec, readGitBlobBytes } from "../lib/io-context.js";
import { ArcError } from "../lib/kernel/index.js";
import {
  assertIndexedMarkdownCheckerAlignment,
  resolveIndexedMarkdownCheckerPaths,
  resolveMarkdownRepositoryRoot,
  runIndexedMarkdownCertification,
  runStagedMarkdownGate,
} from "../lib/markdown/index.js";

/** Certify the complete current Git index and render stable repository-relative findings. */
export async function main(cwd: string = process.cwd()): Promise<number> {
  try {
    const root = await resolveMarkdownRepositoryRoot({ cwd, exec: gitExec, realpath });
    const readBlob = (repoRoot: string, path: string): Promise<Uint8Array | null> =>
      readGitBlobBytes(repoRoot, null, path);
    const runtimePaths = await resolveIndexedMarkdownCheckerPaths({ root, readBlob });
    await runStagedMarkdownGate({
      root,
      exec: gitExec,
      runtimePaths: new Set(runtimePaths),
      certify: async () => {
        await assertIndexedMarkdownCheckerAlignment({ root, readBlob, readFile, runtimePaths });
        const [{ lint }, { markdownRuntimeVersions }] = await Promise.all([
          import("markdownlint/promise"),
          import("./verify-markdown-dependencies.js"),
        ]);
        const result = await runIndexedMarkdownCertification({
          root,
          exec: gitExec,
          readBlob,
          runtimeVersions: markdownRuntimeVersions(),
          lint,
        });
        for (const diagnostic of result.diagnostics) {
          process.stderr.write(`${diagnostic.message}\n`);
          if (diagnostic.remedy !== undefined) process.stderr.write(`  ${diagnostic.remedy}\n`);
        }
        if (result.diagnostics.length > 0) {
          throw new ArcError("Indexed Markdown certification failed", "markdown.index-invalid");
        }
      },
    });
    return 0;
  } catch (error) {
    process.stderr.write(`${formatUnexpectedError(error)}\n`);
    if (error instanceof ArcError && error.code === "markdown.dependency-misaligned") {
      process.stderr.write("Run npm install so installed Markdown dependencies match the indexed candidate.\n");
    }
    return 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main();
