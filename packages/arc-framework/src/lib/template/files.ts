/**
 * File operations for the ARC CLI.
 *
 * Directory creation, template-aware file copying, and gitignore/gitattributes
 * management. Filesystem functions are injectable for unit testing.
 */

import { renderTokens, renderConditionals } from "./render.js";

/** Mkdir function signature matching fs.mkdir. */
export type MkdirFn = (
  path: string,
  opts: { recursive: boolean },
) => Promise<void | string | undefined>;

/** Read function signature matching fs.readFile (utf-8). */
export type ReadFileFn = (path: string) => Promise<string>;

/** Write function signature matching fs.writeFile (utf-8). */
export type WriteFileFn = (path: string, content: string) => Promise<void>;

/**
 * Ensures a directory exists, creating it and any parents if needed.
 *
 * @param dirPath - Directory path to create
 * @param mkdir - Injectable mkdir function
 */
export async function ensureDir(
  dirPath: string,
  mkdir: MkdirFn,
): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Copies a template file to a destination, applying token substitution
 * and conditional block processing.
 *
 * @param src - Source template file path
 * @param dest - Destination file path
 * @param tokens - Token map for `{{TOKEN}}` substitution
 * @param conditions - Condition map for `arc:if` directives
 * @param readFile - Injectable read function
 * @param writeFile - Injectable write function
 */
export async function copyWithRendering(
  src: string,
  dest: string,
  tokens: Record<string, string>,
  conditions: Record<string, string>,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  let content = await readFile(src);
  content = renderTokens(content, tokens);
  content = renderConditionals(content, conditions);
  await writeFile(dest, content);
}

/**
 * Appends a line to a file if it isn't already present.
 * Used for .gitignore and .gitattributes management.
 *
 * Note: callers must `await` each call sequentially — concurrent calls
 * would create a read-check-write race condition (TOCTOU).
 */
async function appendLineIfMissing(
  filePath: string,
  entry: string,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  let content: string;
  try {
    content = await readFile(filePath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      await writeFile(filePath, entry + "\n");
      return;
    }
    throw err;
  }
  const lines = content.split("\n");
  if (lines.includes(entry)) {
    return;
  }
  const newContent = content.endsWith("\n")
    ? content + entry + "\n"
    : content + "\n" + entry + "\n";
  await writeFile(filePath, newContent);
}

/**
 * Appends an entry to a .gitignore file if not already present.
 *
 * @deprecated Use {@link writeArcGitignoreBlock} for ARC-managed entries.
 * Retained for non-ARC gitignore additions if needed.
 */
export async function appendToGitignore(
  filePath: string,
  entry: string,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  await appendLineIfMissing(filePath, entry, readFile, writeFile);
}

const ARC_BLOCK_START = "# ARC Framework (managed by arc cli)";
const ARC_BLOCK_END = "# end ARC";

/**
 * Write a managed block of ARC entries in a .gitignore file.
 *
 * If a managed block already exists (delimited by start/end markers), its
 * contents are replaced with the new entries (preserving any user entries
 * outside the block). If no block exists, one is appended at the end of
 * the file. If the file doesn't exist, it is created.
 *
 * Entries are deduplicated and sorted for stable output. Any ARC entries
 * found outside the managed block (from older `appendToGitignore` calls)
 * are migrated into the block and removed from their original location.
 *
 * @param filePath - Path to .gitignore
 * @param entries - ARC-managed entries to write
 * @param readFile - Injectable read function
 * @param writeFile - Injectable write function
 */
export async function writeArcGitignoreBlock(
  filePath: string,
  entries: string[],
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  const sorted = [...new Set(entries)].sort();

  let content: string;
  try {
    content = await readFile(filePath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const block = formatBlock(sorted);
      await writeFile(filePath, block + "\n");
      return;
    }
    throw err;
  }

  // Remove any legacy ARC entries scattered outside the block
  const lines = content.split("\n");
  const entrySet = new Set(sorted);
  const cleaned = lines.filter((line) => !entrySet.has(line));

  const startIdx = cleaned.indexOf(ARC_BLOCK_START);
  const endIdx = cleaned.indexOf(ARC_BLOCK_END);

  let result: string;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace existing block contents
    const before = cleaned.slice(0, startIdx);
    const after = cleaned.slice(endIdx + 1);
    result = [...before, ...formatBlock(sorted).split("\n"), ...after].join("\n");
  } else {
    // Append new block — ensure blank line separation
    const base = cleaned.join("\n");
    const separator = base.endsWith("\n\n") || base.endsWith("\n")
      ? (base.endsWith("\n\n") ? "" : "\n")
      : "\n\n";
    result = base + separator + formatBlock(sorted) + "\n";
  }

  // Normalize trailing whitespace
  result = result.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");

  await writeFile(filePath, result);
}

/** Format the managed block with markers. */
function formatBlock(entries: string[]): string {
  return [ARC_BLOCK_START, ...entries, ARC_BLOCK_END].join("\n");
}

/**
 * Appends an entry to a .gitattributes file if not already present.
 *
 * @param filePath - Path to .gitattributes
 * @param entry - Entry to add (e.g., "WORK-STATUS.md merge=ours")
 * @param readFile - Injectable read function
 * @param writeFile - Injectable write function
 */
export async function appendToGitattributes(
  filePath: string,
  entry: string,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  await appendLineIfMissing(filePath, entry, readFile, writeFile);
}
