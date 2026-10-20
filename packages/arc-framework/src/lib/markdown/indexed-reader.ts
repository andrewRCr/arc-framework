/** Invocation-local bulk reads of exact indexed Markdown and checker inputs. */

import { readGitBlobBytes, readGitBlobEntries } from "../io-context.js";
import type { ReadIndexedBlob, ReadIndexedBlobs } from "./indexed-snapshot.js";

/** Single and bulk views over one invocation's indexed input cache. */
export interface IndexedMarkdownReader {
  readonly readBlob: ReadIndexedBlob;
  readonly readBlobs: ReadIndexedBlobs;
}

/** Create a fresh reader bound to the caller's captured index selection. */
export function createIndexedMarkdownReader(indexFile?: string): IndexedMarkdownReader {
  const cache = new Map<string, Uint8Array | null>();
  const key = (root: string, path: string): string => `${root}\0${path}`;
  const readBlobs: ReadIndexedBlobs = async (root, paths) => {
    const missing = [...new Set(paths)].filter(path => !cache.has(key(root, path)));
    const loaded = await readGitBlobEntries(root, null, missing, { indexFile });
    for (const path of missing) cache.set(key(root, path), loaded.get(path)?.bytes ?? null);
    const result = new Map<string, Uint8Array>();
    for (const path of paths) {
      const bytes = cache.get(key(root, path));
      if (bytes !== undefined && bytes !== null) result.set(path, bytes);
    }
    return result;
  };
  const readBlob: ReadIndexedBlob = async (root, path) => {
    const cacheKey = key(root, path);
    if (!cache.has(cacheKey)) cache.set(cacheKey, await readGitBlobBytes(root, null, path, { indexFile }));
    return cache.get(cacheKey) ?? null;
  };
  return { readBlob, readBlobs };
}
