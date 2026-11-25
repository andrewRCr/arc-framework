/** Where a store's Git calls and repository lookups run, so a command keeps its store after removing its own checkout. */
import { isAbsolute, relative, resolve, sep } from "node:path";
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
   * @returns That directory, or the repository's primary checkout once the opening path no longer names its worktree.
   */
  workingDirectory: (cwd: string) => Promise<string>;
}

/**
 * Bind a store to the opening worktree while its path still names it, and to the repository's primary checkout after.
 * @param input - The opening checkout, the files Git's directory markers are read through, and an executor that runs
 *   each call in the directory it names.
 * @returns The location; nothing is read until the store first uses it.
 */
export function createStoreCheckoutLocation(input: { checkoutRoot: string; fs: GitDirectoryFileAccess; exec: GitExec }): StoreCheckoutLocation {
  let directories: Promise<GitDirectories> | undefined;
  const gitDirectories = (): Promise<GitDirectories> => directories ??= readCanonicalDirectories(input.checkoutRoot, input.fs)
    .catch((error: unknown) => { directories = undefined; throw error; });
  let primary: Promise<string> | undefined;
  const primaryCheckout = (): Promise<string> => primary ??= gitDirectories().then(async ({ commonDir }) => {
    const { stdout } = await input.exec("git", ["worktree", "list", "--porcelain", "-z"], { cwd: commonDir });
    // Git lists the main worktree first; a bare repository lists its own directory there.
    const main = stdout.split("\0").find((field) => field.startsWith("worktree "));
    if (main === undefined) throw new Error(`Git listed no main worktree for ${commonDir}. Run `
      + "`git worktree list` from the repository, restore its primary checkout, then retry.");
    return nativeGitPath(main.slice("worktree ".length));
  }).catch((error: unknown) => { primary = undefined; throw error; });
  return {
    gitDirectories,
    workingDirectory: async (cwd) => {
      if (!contains(input.checkoutRoot, cwd)) return cwd;
      const opening = directories;
      const found = await gitDirectories().catch(() => undefined);
      if (opening === undefined || found === undefined) return cwd;
      const current = await readCanonicalDirectories(input.checkoutRoot, input.fs).catch((error: unknown) => {
        const code = (error as NodeJS.ErrnoException | null)?.code;
        if (code === "ENOENT" || code === "ENOTDIR") return undefined;
        throw error;
      });
      if (current?.gitDir === found.gitDir && current.commonDir === found.commonDir) return cwd;
      return primaryCheckout();
    },
  };
}

function contains(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function readCanonicalDirectories(checkoutRoot: string, fs: GitDirectoryFileAccess): Promise<GitDirectories> {
  const found = await readGitDirectories(checkoutRoot, fs);
  const gitDir = await fs.realpath(found.gitDir);
  const commonDir = found.commonDir === found.gitDir ? gitDir : await fs.realpath(found.commonDir);
  return { gitDir, commonDir };
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
