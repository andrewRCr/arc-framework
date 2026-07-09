/**
 * Seam-binding assembly for the `STATUS.USER` (in-flight-mine) view — the single
 * place that closes {@link runStatusUserView}'s injected reads over the real git
 * executor and filesystem.
 *
 * Two callers share this assembly so the rendered view never forks:
 *
 * - The `arc status --user` handler, which prints the result to the terminal.
 * - The lifecycle executor's `reconcile-status-user` side-effect, which renders
 *   in local-only mode and writes the result to `STATUS.USER.md` on a location
 *   move.
 *
 * The assembly binds two reads: the last-rendered cache (the degrade target
 * when the remote is unreachable) and the local ready-mine slice. The ready
 * slice reads the filesystem directly through {@link loadReadyMineSlice}; the
 * in-flight half comes entirely from the oracle, including local worktree branches.
 *
 * @module
 */

import { dirname } from "node:path";

import type { GitExec } from "../git/exec.js";
import { resolveUserSurfaceResolver } from "../user-surfaces.js";

import { loadReadyMineSlice } from "./ready-mine-source.js";
import { runStatusUserView, type StatusUserViewResult } from "./user-view.js";

/** Ambient inputs the assembly closes the view's reads over. */
export interface AssembleStatusUserViewDeps {
  /** Repository root containing `.arc/` — the cache and ready-slice path base. */
  cwd: string;
  /** Injectable git executor. */
  exec: GitExec;
  /** Resolved identity; `null` short-circuits (the view is identity-scoped). */
  identity: string | null;
  /** Team mode — gates the in-flight oracle's identity filtering. */
  teamMode: boolean;
  /** `--local` / `--no-fetch`: skip the network read, render from local refs. */
  localOnly: boolean;
  /** Configured base branch; excluded from in-flight classification. */
  baseBranch?: string;
  /** Slugs whose checkout lifecycle record classifies them as parked. */
  parkedSlugs?: ReadonlySet<string>;
  /** Read a file as UTF-8 — used for the `STATUS.USER` cache. */
  readFile: (path: string) => Promise<string>;
  /** Optional writer for persisting a freshly rendered STATUS.USER cache. */
  writeFile?: (path: string, content: string) => Promise<void>;
  /** Optional directory creator paired with {@link writeFile}. */
  mkdir?: (path: string, options: { recursive: boolean }) => Promise<void>;
}

/**
 * Assemble and run the `STATUS.USER` view — bind the cache and ready-mine reads,
 * then delegate to {@link runStatusUserView}.
 *
 * @param deps - Repository root, git executor, identity, mode flags, and the I/O seams.
 * @returns The rendered view result (rendered table, degraded cache, or status message).
 */
export async function assembleStatusUserView(
  deps: AssembleStatusUserViewDeps,
): Promise<StatusUserViewResult> {
  const {
    cwd,
    exec,
    identity,
    teamMode,
    localOnly,
    baseBranch,
    parkedSlugs,
    readFile,
    writeFile,
    mkdir,
  } = deps;

  const statusUserPath = identity === null
    ? null
    : (await resolveUserSurfaceResolver({ cwd, identity, exec })).identityGlobalPath("STATUS.USER.md");

  const view = await runStatusUserView({
    exec,
    identity,
    teamMode,
    localOnly,
    baseBranch,
    parkedSlugs,
    readLastRendered: () =>
      statusUserPath === null
        ? Promise.resolve(null)
        : readFile(statusUserPath).then((content) => content, () => null),
    readReadyMine: () => loadReadyMineSlice({ cwd, identity }),
  });

  if (view.source === "rendered" && statusUserPath !== null && writeFile !== undefined && mkdir !== undefined) {
    try {
      await mkdir(dirname(statusUserPath), { recursive: true });
      await writeFile(statusUserPath, view.output.endsWith("\n") ? view.output : `${view.output}\n`);
    } catch {
      // Advisory cache only — a failed write must not break the already-rendered view.
    }
  }

  return view;
}
