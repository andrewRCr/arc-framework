/** The changed-file set a frontline review of one exact target has to cover, as local Git reports it. */

import type { GitExec } from "../../../../lib/git/exec.js";

/** One path the target adds or modifies, with Git's judgment of whether its content is binary. */
export interface FrontlineChangedFile {
  path: string;
  binary: boolean;
}

const NUMSTAT_RECORD = /^(?:\d+\t\d+|(?<binary>-)\t-)\t(?<path>[^\0]+)$/u;

/**
 * List every path the target adds or modifies; a deleted path has no content left to review.
 *
 * Rename detection stays off so a renamed file is its new path, and text conversion stays off so the binary
 * judgment is Git's own.
 *
 * @param exec - Git boundary.
 * @param input - The review checkout and the target's exact diff base and head.
 * @returns Each surviving changed path in Git's order.
 */
export async function listFrontlineChangedFiles(exec: GitExec, input: {
  reviewRoot: string;
  diffBaseSha: string;
  headSha: string;
  signal: AbortSignal;
}): Promise<FrontlineChangedFile[]> {
  const { stdout } = await exec("git", [
    "diff",
    "--numstat",
    "-z",
    "--no-renames",
    "--no-textconv",
    "--diff-filter=d",
    `${input.diffBaseSha}..${input.headSha}`,
    "--",
  ], { cwd: input.reviewRoot, signal: input.signal, preserveOutput: true });
  const records = stdout.split("\0");
  if (records.at(-1) === "") records.pop();
  return records.map((record) => {
    const match = NUMSTAT_RECORD.exec(record);
    if (match?.groups?.path === undefined) {
      throw new Error("unrecognized changed-file listing from git diff --numstat");
    }
    return { path: match.groups.path, binary: match.groups.binary !== undefined };
  });
}
