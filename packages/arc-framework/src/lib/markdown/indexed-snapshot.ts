/** Exact-index loading for the complete selected Markdown corpus. */

import type { GitExec } from "../git/index.js";
import { ArcError, type ManagedPath } from "../kernel/index.js";
import { enumerateTrackedMarkdownPaths } from "./selection.js";

/** Read one path from the current Git index. */
export type ReadIndexedBlob = (root: string, path: string) => Promise<Uint8Array | null>;

/** Dependencies for constructing one exact indexed Markdown snapshot. */
export interface LoadIndexedMarkdownSnapshotOptions {
  readonly root: string;
  readonly exec: GitExec;
  readonly readBlob: ReadIndexedBlob;
}

/** Repository-relative Markdown content loaded from one index view. */
export type IndexedMarkdownSnapshot = ReadonlyMap<ManagedPath, string>;

function decodeIndexedMarkdown(path: ManagedPath, bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ArcError(`Indexed Markdown is not valid UTF-8: ${path}`, "markdown.index-invalid-utf8", {
      cause: error,
    });
  }
}

/**
 * Enumerate and load every selected Markdown blob from the current index exactly once.
 *
 * @param options - Repository root and injected Git/blob boundaries
 * @returns A deterministic repository-relative content map
 */
export async function loadIndexedMarkdownSnapshot(
  options: LoadIndexedMarkdownSnapshotOptions,
): Promise<IndexedMarkdownSnapshot> {
  const paths = await enumerateTrackedMarkdownPaths({
    root: options.root,
    exec: options.exec,
    source: "index",
  });
  const entries = await Promise.all(paths.map(async (path): Promise<readonly [ManagedPath, string]> => {
    const bytes = await options.readBlob(options.root, path);
    if (bytes === null) {
      throw new ArcError(`Indexed Markdown blob is missing: ${path}`, "markdown.index-blob-missing");
    }
    return [path, decodeIndexedMarkdown(path, bytes)];
  }));
  return new Map(entries);
}
