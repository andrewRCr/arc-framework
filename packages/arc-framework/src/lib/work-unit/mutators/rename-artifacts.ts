/** Rename a work unit's complete artifact set across slug and directory axes. */

import { posix } from "node:path";

import type { GitExec } from "../../git/exec.js";
import { ensureDir, type MkdirFn } from "../../template/files.js";
import {
  artifactMatcher,
  pruneEmptyBacklogSource,
  renameArtifactBasename,
} from "./relocate-artifacts.js";

/** Filesystem seams used by {@link renameArtifacts}. */
export interface RenameArtifactsFs {
  readdir(path: string): Promise<string[]>;
  mkdir: MkdirFn;
  rmdir(path: string): Promise<void>;
}

/** Dependencies for {@link renameArtifacts}. */
export interface RenameArtifactsContext {
  exec: GitExec;
  fs: RenameArtifactsFs;
}

/** Parameters spanning the slug and containing-directory rename axes. */
export interface RenameArtifactsParams {
  sourceSlug: string;
  targetSlug: string;
  fromDir: string;
  toDir: string;
}

/** Exact source/result path pairs moved by a rename. */
export interface RenameArtifactsResult {
  moved: ReadonlyArray<{ source: string; result: string }>;
}

/**
 * Move every exact source-slug artifact directly to its final target path.
 *
 * @param ctx - Injected Git and filesystem seams
 * @param params - Source/target slugs and directories
 * @returns Deterministically ordered source/result pairs
 */
export async function renameArtifacts(
  ctx: RenameArtifactsContext,
  params: RenameArtifactsParams,
): Promise<RenameArtifactsResult> {
  const names = (await ctx.fs.readdir(params.fromDir))
    .filter((name) => name !== `cohort-${params.sourceSlug}.md` && artifactMatcher(params.sourceSlug).test(name))
    .sort();
  if (names.length === 0) return { moved: [] };

  await ensureDir(params.toDir, ctx.fs.mkdir);
  const moved = names.map((name) => ({
    source: posix.join(params.fromDir, name),
    result: posix.join(params.toDir, renameArtifactBasename(name, {
      sourceSlug: params.sourceSlug,
      targetSlug: params.targetSlug,
    })),
  }));
  for (const pair of moved) await ctx.exec("git", ["mv", pair.source, pair.result]);
  await pruneEmptyBacklogSource(ctx.fs, params.fromDir);
  return { moved };
}
