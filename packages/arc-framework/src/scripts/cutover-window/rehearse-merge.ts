/** Merge the copy's main into a branch in the scratch clone, concluding only the conflicts the window's remedies conclude. */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyRoadmapConflictAutoRemedy } from "../../lib/status/roadmap-conflict-auto-remedy.js";
import { resolveArcPath } from "../../lib/layout/index.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import type { WindowParkedPointer } from "./read-map.js";
import { WindowRehearsalStop, type WindowRehearsalContext } from "./rehearse-run.js";
import { isCompletedGitFailure, isGitProcessError } from "../../lib/git/process-error.js";

const roadmap = ".arc/backlog/ROADMAP.md";

/** Merge main into the branch and publish it; a parked unit's branch keeps its side at its pointer and meta, conflict or not. */
export async function mergeRehearsalMain(context: WindowRehearsalContext, branch: string,
  parked: readonly WindowParkedPointer[]): Promise<void> {
  const { sync } = context;
  const branchSide = branchSidePaths(branch, parked);
  await sync.carryLocal(branch);
  await sync.checkout(branch);
  let unmerged: string[] = [];
  try {
    await sync.scratch(["merge", "--quiet", ...branchSide.size > 0 ? ["--no-ff", "--no-commit"] : ["--no-edit"], "origin/main"]);
  } catch (error) {
    unmerged = await unmergedPaths(context);
    if (unmerged.length === 0) throw error;
  }
  if (await merging(context)) {
    for (const path of branchSide) await keepBranchSide(context, path);
    await concludeConflicts(context, branch, unmerged.filter(path => !branchSide.has(path)));
    await sync.scratch(["commit", "--quiet", "--no-edit"]);
  }
  await sync.publish(branch, "HEAD");
}

/**
 * Commit, on the branch, each path's content at its merge base with main, absence included, and publish it. The mirror's
 * tip may already hold that content when only an older local or fetched tip failed; nothing is committed then, and the
 * publication still lets the next sync move a behind local copy to the mirror's tip.
 */
export async function returnRehearsalPaths(context: WindowRehearsalContext, branch: string, paths: readonly string[]): Promise<void> {
  const { sync } = context;
  await sync.carryLocal(branch);
  await sync.checkout(branch);
  const base = (await sync.scratch(["merge-base", "HEAD", "origin/main"])).stdout.trim();
  const present = new Set((await sync.scratch(["ls-tree", "-r", "-z", "--name-only", base, "--", ...paths])).stdout
    .split("\0").filter(Boolean));
  const restore = paths.filter(path => present.has(path)), remove = paths.filter(path => !present.has(path));
  if (restore.length > 0) await sync.scratch(["checkout", "--quiet", base, "--", ...restore]);
  if (remove.length > 0) await sync.scratch(["rm", "--quiet", "--ignore-unmatch", "--", ...remove]);
  if (await stagedChanges(context)) await sync.scratch(["commit", "--quiet", "-m", "Return tracked state to its merge base with main"]);
  await sync.publish(branch, "HEAD");
}

async function stagedChanges(context: WindowRehearsalContext): Promise<boolean> {
  try {
    await context.sync.scratch(["diff", "--cached", "--quiet"]);
    return false;
  } catch (error) {
    if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) return true;
    throw error;
  }
}

function branchSidePaths(branch: string, parked: readonly WindowParkedPointer[]): Set<string> {
  const paths = new Set<string>();
  for (const pointer of parked.filter(entry => entry.branch === branch)) {
    paths.add(pointer.path);
    paths.add(resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse(pointer.slug),
      placement: { kind: "active", scope: { kind: "project" } } }));
  }
  return paths;
}

async function unmergedPaths(context: WindowRehearsalContext): Promise<string[]> {
  return [...new Set((await context.sync.scratch(["diff", "--name-only", "-z", "--diff-filter=U"])).stdout
    .split("\0").filter(Boolean))];
}

async function merging(context: WindowRehearsalContext): Promise<boolean> {
  try {
    await context.sync.scratch(["rev-parse", "--quiet", "--verify", "MERGE_HEAD"]);
    return true;
  } catch (error) {
    if (isGitProcessError(error) && isCompletedGitFailure(error) && error.exitCode === 1) return false;
    throw error;
  }
}

/** Conclude a ROADMAP conflict through its remedy, and stop on any other conflict outside the branch's own side. */
async function concludeConflicts(context: WindowRehearsalContext, branch: string, remaining: readonly string[]): Promise<void> {
  const { sync } = context;
  if (remaining.some(path => path !== roadmap)) {
    await sync.scratch(["merge", "--abort"]);
    throw new WindowRehearsalStop(`Merging main into ${branch} conflicts at ${remaining.join(", ")}.`);
  }
  if (remaining.length > 0) {
    const remedy = await applyRoadmapConflictAutoRemedy({ cwd: sync.layout.scratch, baseBranch: "main",
      exec: (command, args, options) => context.exec(command, args, { ...options, cwd: sync.layout.scratch }),
      writeFile: (path, content) => writeFile(resolve(sync.layout.scratch, path), content) });
    if (remedy.status !== "applied") {
      await sync.scratch(["merge", "--abort"]);
      throw new WindowRehearsalStop(`The ROADMAP remedy did not conclude merging main into ${branch}: ${JSON.stringify(remedy)}.`);
    }
  }
}

/** Put a path back as the branch held it before the merge, absence included. */
async function keepBranchSide(context: WindowRehearsalContext, path: string): Promise<void> {
  const { sync } = context;
  if ((await sync.scratch(["ls-tree", "-z", "--name-only", "HEAD", "--", path])).stdout !== "") {
    await sync.scratch(["checkout", "--quiet", "HEAD", "--", path]);
  } else {
    await sync.scratch(["rm", "--quiet", "--cached", "--ignore-unmatch", "--", path]);
    await sync.scratch(["clean", "--quiet", "--force", "--", path]);
  }
}
