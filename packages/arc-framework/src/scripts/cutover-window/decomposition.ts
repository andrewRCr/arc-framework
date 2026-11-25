/** Refuse unlanded decomposition candidates and leftover staged worktree entries. */
import type { WindowGitReadIO } from "./git.js";
import type { WindowRecord } from "./hold.js";
import type { WindowFinding } from "./result.js";
import { isDecomposeCandidateBranch } from "../../lib/work-unit/decompose-candidate.js";
import { isGitProcessError, isCompletedGitFailure } from "../../lib/git/process-error.js";
import { readFile, lstat, realpath, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readGitDirectories } from "../../lib/git/directories.js";

/** Check candidate tips against the captured main tip without fetching or moving any ref. */
export async function readWindowDecompositionBranchFindings(io: WindowGitReadIO,
  branches: Pick<WindowRecord["branches"], "local" | "origin">): Promise<WindowFinding[]> {
  const main = branches.local.main;
  if (main === undefined) return [{ subject: "main", condition: "No captured local main tip can prove decomposition containment.",
    remedy: "Restore or fetch the main branch, then retry check." }];
  const findings: WindowFinding[] = [];
  for (const side of ["local", "origin"] as const) {
    for (const [branch, tip] of Object.entries(branches[side])) {
      if (!isDecomposeCandidateBranch(branch)) continue;
      const ref = `${side === "local" ? "refs/heads/" : "refs/remotes/origin/"}${branch}`;
      findings.push(...await candidateAncestryFindings(io, ref, tip, main));
    }
  }
  return findings;
}

async function candidateAncestryFindings(io: WindowGitReadIO, ref: string, tip: string, main: string): Promise<WindowFinding[]> {
  try {
    await io.exec("git", ["--no-replace-objects", "merge-base", "--is-ancestor", tip, main],
      { cwd: io.repo, objectAccess: "local-only" });
    return [];
  } catch (error) {
    if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) {
      return [{ subject: ref, condition: `Decomposition candidate ${tip} is not contained in main (${main}).`,
        remedy: "Land the decomposition cut, or delete its candidate branch and worktree, then retry check." }];
    }
    return [{ subject: ref, condition: `Candidate ancestry could not be read: ${error instanceof Error ? error.message : String(error)}`,
      remedy: "Repair Git access and recover readable candidate and main commits, then retry check." }];
  }
}

/** Check the common Git directory's decomposition staging inventory without touching any entry. */
export async function readWindowDecompositionDirectoryFindings(repo: string): Promise<WindowFinding[]> {
  const { commonDir } = await readGitDirectories(repo, { lstat, realpath, readFile: path => readFile(path, "utf8") });
  const directory = join(commonDir, "arc", "decompose-worktrees");
  try {
    return (await readdir(directory)).sort().map(entry => ({ subject: join(directory, entry),
      condition: "A staged decomposition worktree entry remains.",
      remedy: "Land the decomposition cut, or delete its branch and staged worktree entry, then retry check." }));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    return [{ subject: directory, condition: `The decomposition staging inventory could not be read: ${error instanceof Error ? error.message : String(error)}`,
      remedy: "Repair the staging directory and its read access, then retry check." }];
  }
}
