/** Check indexed Markdown for under-wrapping, or explicit worktree files for feedback. */
import { lstat, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
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
import { resolveMarkdownRepositoryRoot, validateExplicitMarkdownPaths } from "../lib/markdown/selection.js";
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

interface UnderwrapInputs {
  readonly root: string;
  readonly paths: readonly string[];
  readonly worktree: boolean;
  readonly allowIgnored: boolean;
  readonly exec: GitExec;
  readonly readBlob: ReadIndexedBlob;
}

async function readUnderwrapStrings(options: UnderwrapInputs): Promise<Record<string, string>> {
  const automatic = options.paths.length === 0;
  const paths = automatic
    ? (await enumerateStagedMarkdownGatePaths(options.root, options.exec)).filter(path => path.endsWith(".md") && !isMarkdownPathExcluded(path))
    : [...new Set(options.paths.map(validateMarkdownPath))];
  for (const path of paths) {
    if (isMarkdownPathExcluded(path)) throw new ArcError(`Markdown path is excluded: ${path}`, "markdown.excluded-path");
  }
  if (options.worktree) {
    await validateExplicitMarkdownPaths({ root: options.root, paths, operation: "lint-read", exec: options.exec, lstat, realpath,
      allowIgnoredPaths: options.allowIgnored ? new Set(paths) : undefined });
    process.stderr.write("Working-tree feedback only; does not certify the Git index.\n");
  }
  const strings: Record<string, string> = {};
  for (const path of paths) {
    const bytes = options.worktree ? await readFile(join(options.root, ...path.split("/"))) : await options.readBlob(options.root, path);
    if (bytes === null && automatic) continue;
    if (bytes === null) throw new ArcError(`Indexed Markdown blob is missing: ${path}`, "markdown.index-blob-missing");
    strings[path] = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  return strings;
}

/** Certify index paths by default; --worktree checks explicit files without certifying the index. */
export async function main(cwd = process.cwd(), receivedPaths: readonly string[] = process.argv.slice(2)): Promise<number> {
  try {
    const { values, positionals } = parseArgs({ args: [...receivedPaths], allowPositionals: true,
      options: { worktree: { type: "boolean", default: false }, "allow-ignored": { type: "boolean", default: false } } });
    if (values["allow-ignored"] && !values.worktree) {
      throw new ArcError("--allow-ignored requires --worktree and explicit Markdown paths", "markdown.invalid-option");
    }
    if (values.worktree && positionals.length === 0) {
      throw new ArcError("--worktree requires at least one Markdown path", "markdown.empty-selection");
    }
    const indexFile = process.env.GIT_INDEX_FILE;
    const exec: GitExec = (command, args, options) => gitExec(command, args, { ...options, indexFile });
    const root = await resolveMarkdownRepositoryRoot({ cwd, exec, realpath });
    const readBlob: ReadIndexedBlob = (repoRoot, path) => readGitBlobBytes(repoRoot, null, path, { indexFile });
    const strings = await readUnderwrapStrings({ root, paths: positionals, worktree: values.worktree,
      allowIgnored: values["allow-ignored"], exec, readBlob });
    if (Object.keys(strings).length === 0) {
      process.stderr.write("No changed indexed Markdown files to check for under-wrapping.\n");
      return 5;
    }
    if (!values.worktree) {
      const runtimePaths = await resolveIndexedMarkdownCheckerPaths({ root, readBlob, entryPaths });
      await assertIndexedMarkdownCheckerAlignment({ root, readBlob, readFile, runtimePaths });
      await loadIndexedMarkdownDependencies({ root, readBlob, runtimeVersions: markdownRuntimeVersions() });
      await assertParserDependency(root, readBlob);
    }
    const result = await lint({ strings, customRules: [underwrapRule], markdownItFactory: () => new MarkdownIt({ html: true }),
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
