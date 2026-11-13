/** Merge the copy's main into a branch in the scratch clone, concluding only the conflicts the window's remedies conclude. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyRoadmapConflictAutoRemedy } from "../../lib/status/roadmap-conflict-auto-remedy.js";
import { resolveArcPath } from "../../lib/layout/index.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import type { WindowParkedPointer } from "./read-map.js";
import { WindowRehearsalStop, type WindowRehearsalContext } from "./rehearse-run.js";

const roadmap = ".arc/backlog/ROADMAP.md";

/** Merge main into the branch and publish it; a parked unit's branch keeps its side at its pointer and meta. */
export async function mergeRehearsalMain(context: WindowRehearsalContext, branch: string,
  parked: readonly WindowParkedPointer[]): Promise<void> {
  const { sync } = context;
  await sync.carryLocal(branch);
  await sync.checkout(branch);
  try {
    await sync.scratch(["merge", "--quiet", "--no-edit", "origin/main"]);
  } catch (error) {
    await concludeMerge(context, branch, branchSidePaths(branch, parked), error);
  }
  await sync.publish(branch, "HEAD");
}

/** Commit, on the branch, each path's content at its merge base with main, absence included, and publish it. */
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
  await sync.scratch(["commit", "--quiet", "-m", "Return tracked state to its merge base with main"]);
  await sync.publish(branch, "HEAD");
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

async function concludeMerge(context: WindowRehearsalContext, branch: string, branchSide: ReadonlySet<string>,
  failure: unknown): Promise<void> {
  const { sync } = context;
  const unmerged = [...new Set((await sync.scratch(["diff", "--name-only", "-z", "--diff-filter=U"])).stdout
    .split("\0").filter(Boolean))];
  if (unmerged.length === 0) throw failure;
  for (const path of unmerged.filter(path => branchSide.has(path))) await keepBranchSide(context, path);
  const remaining = unmerged.filter(path => !branchSide.has(path));
  if (remaining.some(path => path !== roadmap)) {
    await sync.scratch(["merge", "--abort"]);
    throw new WindowRehearsalStop(`Merging main into ${branch} conflicts at ${remaining.join(", ")}.`);
  }
  if (remaining.length > 0) {
    const remedy = await applyRoadmapConflictAutoRemedy({ cwd: sync.layout.scratch, baseBranch: "main",
      exec: (command, args, options) => context.exec(command, args, { ...options, cwd: sync.layout.scratch }),
      writeFile: (path, content) => writeFile(join(sync.layout.scratch, path), content) });
    if (remedy.status !== "applied") {
      await sync.scratch(["merge", "--abort"]);
      throw new WindowRehearsalStop(`The ROADMAP remedy did not conclude merging main into ${branch}: ${JSON.stringify(remedy)}.`);
    }
  }
  await sync.scratch(["commit", "--quiet", "--no-edit"]);
}

async function keepBranchSide(context: WindowRehearsalContext, path: string): Promise<void> {
  const { sync } = context;
  const ours = (await sync.scratch(["ls-files", "-u", "-z", "--", path])).stdout.split("\0").some(row => /^\d+ [a-f0-9]+ 2\t/u.test(row));
  if (ours) {
    await sync.scratch(["checkout", "--quiet", "--ours", "--", path]);
    await sync.scratch(["add", "--", path]);
  } else {
    await sync.scratch(["rm", "--quiet", "--cached", "--ignore-unmatch", "--", path]);
    await sync.scratch(["clean", "--quiet", "--force", "--", path]);
  }
}
