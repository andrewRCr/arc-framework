/**
 * Uncommitted changes among the files an update or reconfigure writes — refused so it starts from a clean point.
 *
 * Both rewrite ARC's installed files in place. Over uncommitted changes to those files, their own changes cannot be
 * told apart from the project's or reset on their own, and an untracked file they overwrite cannot be restored at
 * all. Changes elsewhere in the working tree are left alone.
 *
 * @module
 */

import { join, relative, resolve } from "node:path";

import type { FileChangePlan } from "./plan.js";
import { UserFacingError } from "../errors.js";
import type { GitExec } from "../git/index.js";

/**
 * List the files a plan writes or deletes: every merge and addition, and each Framework removal.
 *
 * @param plan - The change plan
 * @param arcDir - Absolute path to the `.arc/` directory
 * @returns Absolute paths
 */
export function plannedWritePaths(plan: FileChangePlan, arcDir: string): string[] {
  return [
    ...plan.merges,
    ...plan.additions,
    ...plan.removals.filter((entry) => entry.classification === "Framework"),
  ].map((entry) => join(arcDir, entry.outputPath));
}

/**
 * Find which of the given files carry uncommitted changes, staged, unstaged, or untracked.
 *
 * @param exec - Git executor
 * @param cwd - A directory inside the repository
 * @param paths - Files to check, absolute or relative to `cwd`
 * @returns Repository-relative paths in Git's order
 */
export async function findUncommittedPaths(exec: GitExec, cwd: string, paths: readonly string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { stdout } = await exec(
    "git",
    [
      "--literal-pathspecs", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--",
      // Relative pathspecs keep a full install's file list well inside Windows' command-line limit
      ...paths.map((path) => relative(cwd, resolve(cwd, path))),
    ],
    { cwd },
  );
  const fields = stdout.split("\0");
  const dirty: string[] = [];
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index] ?? "";
    if (field.length < 4) continue;
    dirty.push(field.slice(3));
    // A rename or copy is followed by its source path
    if ("RC".includes(field[0] ?? " ") || "RC".includes(field[1] ?? " ")) index++;
  }
  return dirty;
}

/**
 * Build the refusal for an update or reconfigure over uncommitted changes to the files it writes.
 *
 * @param paths - Repository-relative paths with uncommitted changes
 * @param command - The refusing command
 * @returns The user-facing refusal, naming each file and the remedy
 */
export function uncommittedChangesError(
  paths: readonly string[],
  command: "update" | "reconfigure",
): UserFacingError {
  const action = command === "update" ? "Updating" : "Reconfiguring";
  const retry = command === "update" ? "arc update" : "arc init --reconfigure";
  return new UserFacingError({
    code: "manifest.uncommitted-changes",
    whatHappened: `${command} would rewrite files that have uncommitted changes`,
    why: `Uncommitted changes in: ${paths.join(", ")}. ${action} over them leaves no clean point to inspect or reset `
      + `the ${command} from, and an untracked file it overwrote could not be restored.`,
    whatToDo: `Commit or stash these changes, then retry \`${retry}\`.`,
  });
}
