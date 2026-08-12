/** Directed, fail-closed primary-checkout safety reads. */

import type { GitExec } from "../git/exec.js";

export type PrimarySafetyResult =
  | { kind: "complete"; clean: boolean; onBase: boolean; branch: string | null }
  | { kind: "error"; code: "git-topology-unavailable"; message: string };

/** Read clean and configured-base facts only from the resolved primary checkout. */
export async function readPrimarySafety(options: {
  primaryPath: string;
  baseBranch: string;
  exec: GitExec;
}): Promise<PrimarySafetyResult> {
  if (options.baseBranch.trim() === "") {
    return {
      kind: "error",
      code: "git-topology-unavailable",
      message: "Configured base branch is unavailable",
    };
  }
  let status: string;
  let branchText: string;
  try {
    ({ stdout: status } = await options.exec(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=normal"],
      { cwd: options.primaryPath },
    ));
    ({ stdout: branchText } = await options.exec(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: options.primaryPath },
    ));
  } catch (error) {
    return {
      kind: "error",
      code: "git-topology-unavailable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const branch = branchText.trim();
  if (branch === "") {
    return {
      kind: "error",
      code: "git-topology-unavailable",
      message: "Primary branch read returned an empty value",
    };
  }
  return {
    kind: "complete",
    clean: status === "",
    onBase: branch === options.baseBranch,
    branch: branch === "HEAD" ? null : branch,
  };
}
