/** Fresh single and bulk reads of exact indexed Markdown and checker inputs. */

import { readGitBlobBytes, readGitBlobEntries } from "../io-context.js";
import type { ReadIndexedBlob, ReadIndexedBlobs } from "./indexed-snapshot.js";

/** Single and bulk views over the caller's selected index. */
export interface IndexedMarkdownReader {
  readonly readBlob: ReadIndexedBlob;
  readonly readBlobs: ReadIndexedBlobs;
}

/** Create a fresh reader bound to the caller's captured index selection. */
export function createIndexedMarkdownReader(indexFile?: string): IndexedMarkdownReader {
  return {
    readBlob: (root, path) => readGitBlobBytes(root, null, path, { indexFile }),
    readBlobs: async (root, paths) => {
      const loaded = await readGitBlobEntries(root, null, paths, { indexFile });
      return new Map([...loaded].map(([path, entry]) => [path, entry.bytes]));
    },
  };
}
