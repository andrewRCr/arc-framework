/** Git tree snapshots used by executable check requests. */
import type { GitExec } from "../git/exec.js";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
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
 * @returns Changed paths or an unresolved result when Git fails
 */
export async function readTreeChange(git: GitExec, cwd: string, base: string, tree: string): Promise<TreeChange> {
  let output: string;
  try {
    output = (await git("git", ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", base, tree], {
      cwd, preserveOutput: true,
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

/**
 * Compute the tree the entire worktree would stage.
 * @param git - Injectable Git process boundary
 * @param cwd - Repository root
 * @returns The checked tree's object id
 */
export async function stagedWorktreeTree(git: GitExec, cwd: string): Promise<string> {
  const { stdout } = await git("git", ["rev-parse", "--git-path", "index"], { cwd });
  const realIndex = isAbsolute(stdout) ? stdout : resolve(cwd, stdout);
  const directory = await mkdtemp(join(tmpdir(), "arc-check-index-"));
  const indexFile = join(directory, "index");
  try {
    try {
      await copyFile(realIndex, indexFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await git("git", ["read-tree", "--empty"], { cwd, indexFile });
    }
    await git("git", ["add", "-A"], { cwd, indexFile });
    return (await git("git", ["write-tree"], { cwd, indexFile })).stdout;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
