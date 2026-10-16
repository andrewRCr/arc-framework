/** Resolve checkout and common Git directories without starting a Git process. */

import { dirname, join, resolve } from "node:path";

/** Files needed to follow Git's directory markers. */
export interface GitDirectoryFileAccess {
  lstat(path: string): Promise<{ isDirectory(): boolean }>;
  readFile(path: string): Promise<string>;
}

/** The checkout's private metadata directory and its repository-wide directory. */
export interface GitDirectories { gitDir: string; commonDir: string }

/** Follow a checkout's .git marker and its optional commondir marker. */
export async function readGitDirectories(checkoutRoot: string, fs: GitDirectoryFileAccess): Promise<GitDirectories> {
  const marker = resolve(checkoutRoot, ".git");
  const stat = await fs.lstat(marker);
  let gitDir = marker;
  if (!stat.isDirectory()) {
    const match = /^gitdir:\s*(.+)$/u.exec((await fs.readFile(marker)).trim());
    if (!match?.[1]) throw new Error(`Invalid Git directory marker ${marker}; repair it to contain gitdir: <path>`);
    gitDir = resolve(dirname(marker), match[1]);
  }
  try {
    const common = (await fs.readFile(join(gitDir, "commondir"))).trim();
    return { gitDir, commonDir: resolve(gitDir, common) };
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") throw error;
    return { gitDir, commonDir: gitDir };
  }
}
