/**
 * File operations for the ARC CLI.
 *
 * Directory creation, template-aware file copying, and managed block writing
 * for gitignore/gitattributes. Filesystem functions are injectable for unit testing.
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

// --- Managed Block Writing ---

const ARC_BLOCK_START = "# ARC Framework (managed by arc cli)";
const ARC_BLOCK_END = "# end ARC";

/** Format the managed block with markers. */
function formatBlock(entries: string[]): string {
  return [ARC_BLOCK_START, ...entries, ARC_BLOCK_END].join("\n");
}

/**
 * Write a managed block of ARC entries in a dotfile (.gitignore, .gitattributes, etc.).
 *
 * If a managed block already exists (delimited by start/end markers), its
 * contents are replaced with the new entries (preserving any user entries
 * outside the block). If no block exists, one is appended at the end of
 * the file. If the file doesn't exist, it is created.
 *
 * Entries are deduplicated and sorted for stable output.
 *
 * @param filePath - Path to the dotfile
 * @param entries - ARC-managed entries to write
 * @param readFile - Injectable read function
 * @param writeFile - Injectable write function
 */
export async function writeArcManagedBlock(
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

  const lines = content.split("\n");

  const startIdx = lines.indexOf(ARC_BLOCK_START);
  const endIdx = lines.indexOf(ARC_BLOCK_END);

  let result: string;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace existing block contents
    const before = lines.slice(0, startIdx);
    const after = lines.slice(endIdx + 1);
    result = [...before, ...formatBlock(sorted).split("\n"), ...after].join("\n");
  } else {
    // Append new block — ensure blank line separation
    const base = lines.join("\n");
    const separator = base.endsWith("\n\n") || base.endsWith("\n")
      ? (base.endsWith("\n\n") ? "" : "\n")
      : "\n\n";
    result = base + separator + formatBlock(sorted) + "\n";
  }

  // Normalize trailing whitespace
  result = result.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");

  await writeFile(filePath, result);
}

/**
 * Write ARC-managed entries to a .gitignore file.
 *
 * Convenience wrapper around {@link writeArcManagedBlock}.
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
  await writeArcManagedBlock(filePath, entries, readFile, writeFile);
}

/**
 * Write ARC-managed entries to a .gitattributes file.
 *
 * Convenience wrapper around {@link writeArcManagedBlock}.
 *
 * @param filePath - Path to .gitattributes
 * @param entries - ARC-managed entries to write
 * @param readFile - Injectable read function
 * @param writeFile - Injectable write function
 */
export async function writeArcGitattributesBlock(
  filePath: string,
  entries: string[],
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  await writeArcManagedBlock(filePath, entries, readFile, writeFile);
}
