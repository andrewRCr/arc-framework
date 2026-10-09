/** Paths authored or historically conflicted during an active merge. */
import { readFile as fsReadFile } from "node:fs/promises";
import type { GitExec } from "../git/exec.js";
import { isGitObjectId } from "../git/object-id.js";

/** Active parents and the exact paths whose conclusion needs checking. */
export interface MergeCheckPaths { merged: string[]; paths: string[] }
/** Filesystem boundary for checkout-private merge metadata. */
export type MergeMetadataReader = (path: string) => Promise<string>;

/**
 * Unite recorded conflicts with staged paths that differ from every parent.
 * @param git - Git process boundary scoped to the checkout
 * @param root - Repository root
 * @param head - Captured first-parent commit
 * @param tree - Exact staged tree
 * @param readFile - Merge metadata filesystem boundary
 * @returns Active merge coordinates, or no observation outside a merge
 */
export async function readMergeCheckPaths(
  git: GitExec, root: string, head: string, tree: string,
  readFile: MergeMetadataReader = path => fsReadFile(path, "utf8"),
): Promise<MergeCheckPaths | undefined> {
  const headPath = await mergeMetadataPath(git, root, "MERGE_HEAD");
  let parentText: string;
  try { parentText = await readFile(headPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const merged = parentText.trim().split(/\r?\n/u);
  if (!merged.every(isGitObjectId)) {
    throw new Error("MERGE_HEAD does not contain complete parent object identifiers");
  }
  const message = await readFile(await mergeMetadataPath(git, root, "MERGE_MSG"));
  const conflicts = message.split(/\r?\n/u).flatMap(line => {
    const match = /^#?\t(.+)$/u.exec(line);
    return match?.[1] === undefined ? [] : [match[1]];
  });
  const output = (await git("git", ["diff", "--name-only", "-z", "--no-renames", tree, head, ...merged, "--"], {
    cwd: root, preserveOutput: true, clearPathspecEnvironment: true,
  })).stdout;
  const authored = output === "" ? [] : output.split("\0");
  if (output !== "" && (authored.pop() !== "" || authored.some(path => path === ""))) {
    throw new Error("Malformed combined Git tree diff");
  }
  return { merged, paths: [...new Set([...conflicts, ...authored])] };
}

async function mergeMetadataPath(git: GitExec, root: string, name: string): Promise<string> {
  return (await git("git", ["rev-parse", "--path-format=absolute", "--git-path", name], { cwd: root })).stdout.trim();
}
