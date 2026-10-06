/**
 * The production binding of the prepared current-WU reconcile seam that
 * dependent-owned write ceremonies use.
 *
 * Preparation reads the lifecycle index, the committed transition history at
 * `HEAD`, and the current work unit's artifacts; application writes the prepared
 * edits and stages them into the index the ceremony selects.
 *
 * @module
 */

import { readdir } from "node:fs/promises";

import type { UserIOContext } from "../../commands/user/types.js";
import { captureGitIndexState, type GitExec, type RawGitExec } from "../git/exec.js";
import {
  enumerateGitTransitionRecords,
  queryGitTransitionDisposition,
} from "./git-transition-record-enumeration.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "./lifecycle-index.js";
import { listCurrentWuArtifactPaths } from "./reference-reconcile.js";
import {
  applyPreparedCurrentWuReconcile,
  prepareCurrentWuReconcile,
  type CurrentWuReconcileCeremony,
} from "./side-effects/discharge-dep-edges.js";

/** Ambient inputs the current-WU reconcile seam closes over. */
export interface CurrentWuReconcileDeps {
  /** Repository root containing `.arc/` and the path-resolution base. */
  cwd: string;
  /** I/O context carrying the filesystem ops. */
  io: UserIOContext;
  /** Git executor pinned to the repository root. */
  exec: GitExec;
  /** Byte-preserving Git seam for transition history reads. */
  transitionExec: RawGitExec;
  /** The lifecycle-index scan seam the executor's entry build shares. */
  indexFs: LifecycleIndexFs;
  /** Resolve a cwd-relative path to an absolute one. */
  at: (path: string) => string;
}

/**
 * Bind the prepare/apply ceremony for reconciling the current work unit's references.
 *
 * @param deps - Repository root, I/O context, git executors, index scan seam, and path resolver.
 * @returns The bound current-WU reconcile ceremony.
 */
export function buildCurrentWuReconcile(deps: CurrentWuReconcileDeps): CurrentWuReconcileCeremony {
  const { cwd, io, exec, transitionExec, indexFs, at } = deps;
  return {
    prepare: async (op) =>
      prepareCurrentWuReconcile(
        {
          index: await buildLifecycleIndex({ cwd, fs: indexFs }),
          queryDisposition: (input) =>
            queryGitTransitionDisposition(transitionExec, "HEAD", input),
          enumerateTransitionRecords: () => enumerateGitTransitionRecords(transitionExec, "HEAD"),
          listArtifactPaths: (slug, ownedMetaPath) =>
            listCurrentWuArtifactPaths(slug, ownedMetaPath, (path) => readdir(at(path))),
          readFile: (path) => io.readFile(at(path)),
        },
        op,
      ),
    apply: (prepared) =>
      applyPreparedCurrentWuReconcile(
        {
          readFile: (path) => io.readFile(at(path)),
          writeFile: (path, content) => io.writeFile(at(path), content),
          stagePaths: async (paths, indexFile) => {
            if (paths.length > 0) await exec("git", ["add", "--", ...paths], { indexFile });
          },
          captureIndexState: () => captureGitIndexState(exec, cwd),
        },
        prepared,
      ),
  };
}
