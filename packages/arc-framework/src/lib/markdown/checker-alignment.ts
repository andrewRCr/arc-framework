/** Candidate/runtime byte alignment for staged Markdown checker implementation. */

import { Buffer } from "node:buffer";
import { join, posix } from "node:path";

import { ArcError, validateManagedPath, type ManagedPath } from "../kernel/index.js";
import type { ReadIndexedBlob } from "./indexed-snapshot.js";
import { MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS } from "./staged-gate.js";

const STATIC_MODULE_SPECIFIER_RE =
  /^\s*(?:import|export)\s+(?:type\s+)?(?:[^;]*?\s+from\s+)?["'](?<specifier>[^"']+)["']/gmu;
const DYNAMIC_MODULE_SPECIFIER_RE = /\bimport\s*\(\s*["'](?<specifier>[^"']+)["']\s*\)/gu;

/** Inputs for proving the executing checker matches its indexed candidate. */
export interface AssertIndexedMarkdownCheckerAlignmentOptions {
  readonly root: string;
  readonly readBlob: ReadIndexedBlob;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly runtimePaths?: readonly string[];
}

/** Inputs for resolving every indexed source module the staged checker can execute. */
export interface ResolveIndexedMarkdownCheckerPathsOptions {
  readonly root: string;
  readonly readBlob: ReadIndexedBlob;
  readonly entryPaths?: readonly string[];
}

function decodeSource(path: ManagedPath, bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ArcError(`Indexed Markdown checker is not valid UTF-8: ${path}`, "markdown.checker-misaligned", {
      cause: error,
    });
  }
}

function importedSpecifiers(source: string): readonly string[] {
  const found: string[] = [];
  for (const pattern of [STATIC_MODULE_SPECIFIER_RE, DYNAMIC_MODULE_SPECIFIER_RE]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const specifier = match.groups?.specifier;
      if (specifier?.startsWith(".") === true) found.push(specifier);
    }
  }
  return found;
}

function resolveSourceImport(importer: ManagedPath, specifier: string): ManagedPath {
  const resolved = posix.normalize(posix.join(posix.dirname(importer), specifier));
  const source = resolved.endsWith(".js")
    ? `${resolved.slice(0, -3)}.ts`
    : resolved;
  if (!source.startsWith("packages/arc-framework/src/") || !source.endsWith(".ts")) {
    throw new ArcError(
      `Indexed Markdown checker has an unsupported relative import: ${importer} -> ${specifier}`,
      "markdown.checker-misaligned",
    );
  }
  return validateManagedPath(source);
}

/** Resolve the complete relative TypeScript dependency closure from indexed checker sources. */
export async function resolveIndexedMarkdownCheckerPaths(
  options: ResolveIndexedMarkdownCheckerPathsOptions,
): Promise<readonly ManagedPath[]> {
  const entries = (options.entryPaths ?? MARKDOWN_RUNTIME_IMPLEMENTATION_PATHS).map(validateManagedPath);
  const discovered = new Set<ManagedPath>(entries);
  const queue = [...entries];

  for (let index = 0; index < queue.length; index += 1) {
    const path = queue[index];
    if (path === undefined) continue;
    const indexed = await options.readBlob(options.root, path);
    if (indexed === null) {
      throw new ArcError(`Indexed Markdown checker is missing: ${path}`, "markdown.checker-misaligned");
    }
    for (const specifier of importedSpecifiers(decodeSource(path, indexed))) {
      const dependency = resolveSourceImport(path, specifier);
      if (discovered.has(dependency)) continue;
      discovered.add(dependency);
      queue.push(dependency);
    }
  }
  return queue;
}

/** Refuse partial staging when the checker executing from the worktree differs from its indexed source. */
export async function assertIndexedMarkdownCheckerAlignment(
  options: AssertIndexedMarkdownCheckerAlignmentOptions,
): Promise<void> {
  const runtimePaths = options.runtimePaths ?? await resolveIndexedMarkdownCheckerPaths(options);
  for (const rawPath of runtimePaths) {
    const path = validateManagedPath(rawPath);
    const indexed = await options.readBlob(options.root, path);
    if (indexed === null) {
      throw new ArcError(`Indexed Markdown checker is missing: ${path}`, "markdown.checker-misaligned");
    }
    let runtime: Uint8Array;
    try {
      runtime = await options.readFile(join(options.root, ...path.split("/")));
    } catch (error) {
      throw new ArcError(`Runtime Markdown checker is unreadable: ${path}`, "markdown.checker-misaligned", {
        cause: error,
      });
    }
    if (!Buffer.from(indexed).equals(Buffer.from(runtime))) {
      throw new ArcError(
        `Indexed Markdown checker differs from executing worktree bytes: ${path}; stage or revert the checker change`,
        "markdown.checker-misaligned",
      );
    }
  }
}
