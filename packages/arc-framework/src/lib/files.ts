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
  } catch {
    // File doesn't exist — create it with just this entry
    await writeFile(filePath, entry + "\n");
    return;
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
 * @param filePath - Path to .gitignore
 * @param entry - Entry to add (e.g., ".pristine/")
 * @param readFile - Injectable read function
 * @param writeFile - Injectable write function
 */
export async function appendToGitignore(
  filePath: string,
  entry: string,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  await appendLineIfMissing(filePath, entry, readFile, writeFile);
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
