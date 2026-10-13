/** Check selected changed Markdown blobs for under-wrapping in the exact Git index. */
import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { lint } from "markdownlint/promise";
import { z } from "zod";
import { formatUnexpectedError } from "../lib/errors.js";
import type { GitExec } from "../lib/git/index.js";
import { gitExec, readGitBlobBytes } from "../lib/io-context.js";
import { ArcError } from "../lib/kernel/index.js";
import { isMarkdownPathExcluded, validateMarkdownPath } from "../lib/markdown/authority.js";
import { assertIndexedMarkdownCheckerAlignment, resolveIndexedMarkdownCheckerPaths } from "../lib/markdown/checker-alignment.js";
import { loadIndexedMarkdownDependencies } from "../lib/markdown/indexed-dependencies.js";
import type { ReadIndexedBlob } from "../lib/markdown/indexed-snapshot.js";
import { resolveMarkdownRepositoryRoot } from "../lib/markdown/selection.js";
import { enumerateStagedMarkdownGatePaths } from "../lib/markdown/staged-gate.js";
import { underwrapRule } from "../lib/markdown/underwrap.js";
import { markdownRuntimeVersions } from "./verify-markdown-dependencies.js";

const entryPaths = ["packages/arc-framework/src/scripts/lint-markdown-underwrap.ts"];
const require = createRequire(import.meta.url);

async function assertParserDependency(root: string, readBlob: ReadIndexedBlob): Promise<void> {
  const version = z.object({ version: z.string() }).parse(require("markdown-it/package.json")).version;
  const manifestSchema = z.object({ devDependencies: z.object({ "markdown-it": z.literal(version) }) });
  const lockSchema = z.object({ packages: z.object({
    "": manifestSchema,
    "node_modules/markdown-it": z.object({ version: z.literal(version) }),
  }) });
  const [manifest, lock] = await Promise.all(["package.json", "package-lock.json"].map(async path => {
    const bytes = await readBlob(root, path);
    if (bytes === null) throw new ArcError(`Indexed dependency input is missing: ${path}`, "markdown.dependency-misaligned");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  }));
  if (!manifestSchema.safeParse(manifest).success || !lockSchema.safeParse(lock).success) {
    throw new ArcError("Indexed markdown-it differs from the loaded parser. Run npm install and re-stage dependency inputs.",
      "markdown.dependency-misaligned");
  }
}

/** Certify only received Markdown paths, or changed staged paths when called without operands. */
export async function main(cwd = process.cwd(), receivedPaths: readonly string[] = process.argv.slice(2)): Promise<number> {
  try {
    const indexFile = process.env.GIT_INDEX_FILE;
    const exec: GitExec = (command, args, options) => gitExec(command, args, { ...options, indexFile });
    const root = await resolveMarkdownRepositoryRoot({ cwd, exec, realpath });
    const readBlob: ReadIndexedBlob = (repoRoot, path) => readGitBlobBytes(repoRoot, null, path, { indexFile });
    const automatic = receivedPaths.length === 0;
    const paths = automatic
      ? (await enumerateStagedMarkdownGatePaths(root, exec)).filter(path => path.endsWith(".md") && !isMarkdownPathExcluded(path))
      : [...new Set(receivedPaths.map(validateMarkdownPath))];
    const strings: Record<string, string> = {};
    for (const path of paths) {
      if (isMarkdownPathExcluded(path)) throw new ArcError(`Markdown path is excluded: ${path}`, "markdown.excluded-path");
      const bytes = await readBlob(root, path);
      if (bytes === null && automatic) continue;
      if (bytes === null) throw new ArcError(`Indexed Markdown blob is missing: ${path}`, "markdown.index-blob-missing");
      strings[path] = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    if (Object.keys(strings).length === 0) {
      process.stderr.write("No changed indexed Markdown files to check for under-wrapping.\n");
      return 5;
    }
    const runtimePaths = await resolveIndexedMarkdownCheckerPaths({ root, readBlob, entryPaths });
    await assertIndexedMarkdownCheckerAlignment({ root, readBlob, readFile, runtimePaths });
    await loadIndexedMarkdownDependencies({ root, readBlob, runtimeVersions: markdownRuntimeVersions() });
    await assertParserDependency(root, readBlob);
    const result = await lint({ strings, customRules: [underwrapRule], markdownItFactory: () => new MarkdownIt(),
      config: { default: false, ARC001: { min: 75, max: 120 } } });
    for (const [path, errors] of Object.entries(result)) {
      for (const error of errors) process.stderr.write(`${path}:${error.lineNumber} ARC001 ${error.errorDetail}\n`);
    }
    return Object.values(result).some(errors => errors.length > 0) ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${formatUnexpectedError(error)}\n`);
    return 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main();
