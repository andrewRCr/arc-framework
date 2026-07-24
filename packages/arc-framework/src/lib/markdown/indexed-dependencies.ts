/** Exact-index dependency evidence for Markdown lint semantics. */

import { ArcError } from "../kernel/index.js";
import {
  assertMarkdownDependencyAlignment,
  type MarkdownDependencyVersions,
} from "./dependency-alignment.js";
import type { ReadIndexedBlob } from "./indexed-snapshot.js";

/** Candidate dependency inputs whose index changes can alter Markdown certification. */
export const MARKDOWN_DEPENDENCY_PATHS = [
  "package.json",
  "packages/arc-framework/package.json",
  "package-lock.json",
] as const;

/** Inputs for validating indexed dependency metadata against loaded modules. */
export interface LoadIndexedMarkdownDependenciesOptions {
  readonly root: string;
  readonly readBlob: ReadIndexedBlob;
  readonly runtimeVersions: MarkdownDependencyVersions;
}

function parseJson(path: string, bytes: Uint8Array): unknown {
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ArcError(`Indexed dependency input is not valid UTF-8: ${path}`, "markdown.dependency-misaligned", {
      cause: error,
    });
  }
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new ArcError(`Indexed dependency input is malformed: ${path}`, "markdown.dependency-misaligned", {
      cause: error,
    });
  }
}

/** Load the three indexed dependency inputs once and assert candidate/runtime alignment. */
export async function loadIndexedMarkdownDependencies(
  options: LoadIndexedMarkdownDependenciesOptions,
): Promise<MarkdownDependencyVersions> {
  const loaded = await Promise.all(MARKDOWN_DEPENDENCY_PATHS.map(async (path) => {
    const bytes = await options.readBlob(options.root, path);
    if (bytes === null) {
      throw new ArcError(`Indexed dependency input is missing: ${path}`, "markdown.dependency-misaligned");
    }
    return parseJson(path, bytes);
  }));
  return assertMarkdownDependencyAlignment({
    rootManifest: loaded[0],
    packageManifest: loaded[1],
    lockfile: loaded[2],
    runtimeVersions: options.runtimeVersions,
  });
}
