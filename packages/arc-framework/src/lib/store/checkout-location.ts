/** Where a store's Git calls and repository lookups run, so a command keeps its store after removing its own checkout. */
import { isAbsolute, relative, resolve } from "node:path";
import { readGitDirectories, type GitDirectories, type GitDirectoryFileAccess } from "../git/directories.js";
import type { GitExec } from "../git/exec.js";
import { nativeGitPath } from "../local-path-identity.js";

/** The repository a store opened in, found once, and the directory each of its Git calls runs in. */
export interface StoreCheckoutLocation {
  /** The opening checkout's Git directories, read when the store first runs Git there and kept once read. */
  gitDirectories: () => Promise<GitDirectories>;
  /**
   * Choose where a Git call meant for a directory runs.
   * @param cwd - The directory the call names.
   * @returns That directory, or the repository's primary checkout once the opening checkout loses its Git metadata.
   */
  workingDirectory: (cwd: string) => Promise<string>;
}

/**
 * Bind a store to the opening checkout while its Git metadata remains, and to the repository's primary checkout after.
 * @param input - The opening checkout, the files Git's directory markers are read through, and an executor that runs
 *   each call in the directory it names.
 * @returns The location; nothing is read until the store first uses it.
 */
export function createStoreCheckoutLocation(input: { checkoutRoot: string; fs: GitDirectoryFileAccess; exec: GitExec }): StoreCheckoutLocation {
  let directories: Promise<GitDirectories> | undefined;
  const marker = resolve(input.checkoutRoot, ".git");
  const gitDirectories = (): Promise<GitDirectories> => directories ??= readGitDirectories(input.checkoutRoot, input.fs)
    .catch((error: unknown) => { directories = undefined; throw error; });
  let primary: Promise<string> | undefined;
  const primaryCheckout = (): Promise<string> => primary ??= gitDirectories().then(async ({ commonDir }) => {
    const { stdout } = await input.exec("git", ["worktree", "list", "--porcelain", "-z"], { cwd: commonDir });
    // Git lists the main worktree first; a bare repository lists its own directory there.
    const main = stdout.split("\0").find((field) => field.startsWith("worktree "));
    if (main === undefined) throw new Error(`Git listed no main worktree for ${commonDir}.`);
    return nativeGitPath(main.slice("worktree ".length));
  }).catch((error: unknown) => { primary = undefined; throw error; });
  return {
    gitDirectories,
    workingDirectory: async (cwd) => {
      if (!contains(input.checkoutRoot, cwd)) return cwd;
      const found = await gitDirectories().catch(() => undefined);
      // A linked checkout's folder or gitfile can outlive Git's removal of its private metadata.
      if (found === undefined || await present(input.fs, marker)
        && (found.gitDir === marker || await present(input.fs, found.gitDir))) return cwd;
      return primaryCheckout().catch(() => cwd);
    },
  };
}

function contains(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function present(fs: GitDirectoryFileAccess, path: string): Promise<boolean> {
  try {
    await fs.lstat(path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    return code !== "ENOENT" && code !== "ENOTDIR";
  }
}

/**
 * Read a store's Git directories through its location when it has one, else through its checkout.
 * @param ports - The store's checkout, files, and optional location lookup.
 * @returns The checkout's Git directories.
 */
export function readStoreGitDirectories(ports: { checkoutRoot: string; fs: GitDirectoryFileAccess;
  gitDirectories?: () => Promise<GitDirectories> }): Promise<GitDirectories> {
  return ports.gitDirectories?.() ?? readGitDirectories(ports.checkoutRoot, ports.fs);
}
