/** Resolve checkout and common Git directories without starting a Git process. */

import { dirname, join, resolve } from "node:path";

/** Files needed to follow Git's directory markers. */
export interface GitDirectoryFileAccess {
  lstat(path: string): Promise<{ isDirectory(): boolean }>;
  readFile(path: string): Promise<string>;
  realpath(path: string): Promise<string>;
}

/** The checkout's private metadata directory and its repository-wide directory. */
export interface GitDirectories { gitDir: string; commonDir: string }

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** Read a .git that is not itself a directory: a gitfile, or a symlink to a directory, which Git treats as one. */
async function readMarkedGitDir(marker: string, fs: GitDirectoryFileAccess): Promise<string> {
  let content: string;
  try {
    content = await fs.readFile(marker);
  } catch (error) {
    if (hasCode(error, "EISDIR")) return marker;
    throw error;
  }
  const match = /^gitdir:\s*(.+)$/u.exec(content.trim());
  if (!match?.[1]) throw new Error(`Invalid Git directory marker ${marker}; repair it to contain gitdir: <path>`);
  return resolve(dirname(marker), match[1]);
}

/** Follow a checkout's .git marker and its optional commondir marker. */
export async function readGitDirectories(checkoutRoot: string, fs: GitDirectoryFileAccess): Promise<GitDirectories> {
  const marker = resolve(checkoutRoot, ".git");
  const gitDir = (await fs.lstat(marker)).isDirectory() ? marker : await readMarkedGitDir(marker, fs);
  let common: string;
  try {
    common = (await fs.readFile(join(gitDir, "commondir"))).trim();
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
    return { gitDir, commonDir: gitDir };
  }
  return { gitDir, commonDir: resolve(await fs.realpath(gitDir), common) };
}
