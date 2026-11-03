/** Resolve checkout and common Git directories without starting a Git process. */

import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";

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
  // Git removes only CR/LF terminators; every other byte after the exact prefix belongs to the path.
  const value = content.replace(/[\r\n]+$/u, "");
  if (!value.startsWith("gitdir: ") || value.length <= 8) {
    throw new Error(`Invalid Git directory marker ${marker}; repair it to contain gitdir: <path>`);
  }
  return resolveMarkerPath(dirname(marker), value.slice(8), fs);
}

/** Preserve physical parent traversal before path normalization can erase a symlink component. */
async function resolveMarkerPath(base: string, value: string, fs: GitDirectoryFileAccess): Promise<string> {
  const root = isAbsolute(value) ? parse(value).root : "";
  let coordinate = root || base;
  let components: string[] = [];
  for (const component of value.slice(root.length).split(sep === "\\" ? /[\\/]+/u : /\/+/u)) {
    if (component === "..") {
      coordinate = dirname(await fs.realpath(resolve(coordinate, ...components)));
      components = [];
    } else components.push(component);
  }
  return resolve(coordinate, ...components);
}

/**
 * Follow a Git directory's optional commondir marker.
 * @param gitDir - A checkout's private Git directory.
 * @param fs - File access for the marker.
 * @returns The common directory, or `gitDir` itself where it holds no commondir.
 */
export async function readCommonDirectory(gitDir: string, fs: GitDirectoryFileAccess): Promise<string> {
  let common: string;
  try {
    common = (await fs.readFile(join(gitDir, "commondir"))).replace(/[\r\n]+$/u, "");
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
    return gitDir;
  }
  return resolveMarkerPath(await fs.realpath(gitDir), common, fs);
}

/** Follow a checkout's .git marker and its optional commondir marker. */
export async function readGitDirectories(checkoutRoot: string, fs: GitDirectoryFileAccess): Promise<GitDirectories> {
  const marker = resolve(checkoutRoot, ".git");
  const gitDir = (await fs.lstat(marker)).isDirectory() ? marker : await readMarkedGitDir(marker, fs);
  return { gitDir, commonDir: await readCommonDirectory(gitDir, fs) };
}
