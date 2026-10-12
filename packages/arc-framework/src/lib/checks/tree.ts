/** Git tree snapshots used by executable check requests. */
import type { GitExec } from "../git/exec.js";
import { copyFile, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";

/** One path's full before/after object identity in a tree change. */
export interface TreePathChange {
  path: string;
  status: "A" | "M" | "D" | "T";
  oldMode: string;
  newMode: string;
  oldBlob: string;
  newBlob: string;
}
/** A successful empty diff remains distinct from unavailable Git output. */
export type TreeChange = { status: "known"; paths: TreePathChange[] } | { status: "unresolved" };

/**
 * Read a change between exact tree coordinates, without rename detection.
 * @param git - Injectable Git process boundary
 * @param cwd - Repository root
 * @param base - Starting coordinate
 * @param tree - Checked tree
 * @param pathspecs - Optional explicit Git pathspecs
 * @returns Changed paths or an unresolved result when Git fails
 */
export async function readTreeChange(git: GitExec, cwd: string, base: string, tree: string, pathspecs: readonly string[] = []): Promise<TreeChange> {
  let output: string;
  try {
    output = (await git("git", ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", base, tree, "--", ...pathspecs], {
      cwd, preserveOutput: true, clearPathspecEnvironment: true,
    })).stdout;
  } catch {
    return { status: "unresolved" };
  }
  return { status: "known", paths: parseTreeDiff(output) };
}

function parseTreeDiff(output: string): TreePathChange[] {
  if (output === "") return [];
  const fields = output.split("\0");
  if (fields.pop() !== "" || fields.length % 2 !== 0) throw new Error("Malformed Git tree diff");
  const paths: TreePathChange[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const header = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-9a-f]{40}|[0-9a-f]{64}) ([AMDT])$/u.exec(fields[index] ?? "");
    const path = fields[index + 1];
    if (header === null || path === undefined || path === "") throw new Error("Malformed Git tree diff");
    const [, oldMode = "", newMode = "", oldBlob = "", newBlob = "", status] = header;
    paths.push({
      path, oldMode, newMode, oldBlob, newBlob, status: status as TreePathChange["status"],
    });
  }
  return paths;
}

/** A retained worktree snapshot and the index carrying its cached file metadata. */
export interface WorktreeSnapshot {
  tree: string;
  indexFile: string;
  refresh(): Promise<string>;
  remove(): Promise<void>;
}

/**
 * Snapshot staged-worktree content while retaining its private index for readers and refreshes.
 * @param git - Injectable Git process boundary
 * @param cwd - Repository root
 * @param parent - Optional directory for the disposable index
 * @returns Snapshot coordinates and cleanup boundary
 */
export async function createWorktreeSnapshot(git: GitExec, cwd: string, parent = tmpdir()): Promise<WorktreeSnapshot> {
  const realIndex = await checkoutIndexPath(git, cwd);
  const directory = await mkdtemp(join(parent, "arc-check-index-"));
  const indexFile = join(directory, "index");
  const remove = async () => { await rm(directory, { recursive: true, force: true }); };
  const snapshot: WorktreeSnapshot = {
    tree: "", indexFile, remove,
    refresh: async () => {
      await git("git", ["add", "-A"], { cwd, indexFile });
      snapshot.tree = (await git("git", ["write-tree"], { cwd, indexFile })).stdout;
      return snapshot.tree;
    },
  };
  try {
    await copyIndex(git, cwd, realIndex, indexFile);
    await snapshot.refresh();
    return snapshot;
  } catch (error) {
    await remove();
    throw error;
  }
}

/**
 * Compute the tree an index stages without letting Git write back to that index.
 * @param git - Injectable Git process boundary
 * @param cwd - Repository root
 * @param index - The index to read, relative to the repository root unless absolute; the checkout's own index when
 *   omitted
 * @returns The staged tree's object id
 */
export async function stagedIndexTree(git: GitExec, cwd: string, index?: string): Promise<string> {
  const source = index === undefined ? await checkoutIndexPath(git, cwd) : resolve(cwd, index);
  const directory = await mkdtemp(join(tmpdir(), "arc-check-index-"));
  const indexFile = join(directory, "index");
  try {
    await copyIndex(git, cwd, source, indexFile);
    return (await git("git", ["write-tree"], { cwd, indexFile })).stdout;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function checkoutIndexPath(git: GitExec, cwd: string): Promise<string> {
  const { stdout } = await git("git", ["rev-parse", "--git-path", "index"], { cwd });
  return isAbsolute(stdout) ? stdout : resolve(cwd, stdout);
}

async function copyIndex(git: GitExec, cwd: string, source: string, indexFile: string): Promise<void> {
  try {
    const original = await stat(source);
    await copyFile(source, indexFile);
    // Preserve the timestamp used by Git to distrust racy cached file metadata.
    await utimes(indexFile, original.atime, original.mtime);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await git("git", ["read-tree", "--empty"], { cwd, indexFile });
  }
}

/**
 * Compute the tree the entire worktree would stage.
 * @param git - Injectable Git process boundary
 * @param cwd - Repository root
 * @returns The checked tree's object id
 */
export async function stagedWorktreeTree(git: GitExec, cwd: string): Promise<string> {
  const snapshot = await createWorktreeSnapshot(git, cwd);
  try { return snapshot.tree; } finally { await snapshot.remove(); }
}
