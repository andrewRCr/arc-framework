/**
 * `refresh-base` — resolve the authoritative base ref for a post-merge cleanup.
 *
 * Right after a remote merge the *local* base branch is typically stale — the
 * merge landed on `<remote>/<base>`, not yet pulled — so any containment or
 * fast-forward check against the local ref false-negatives a merged branch. This
 * leg fetches `<remote>/<base>` and returns it as the authoritative ref, so the
 * composing verb evaluates against the post-merge remote rather than a possibly
 * stale local `base`.
 *
 * A reusable leg (alongside the merged-safe `reconcile-branch` delete and the
 * `fetch-prune` leg) that both `arc teardown` and `arc errand close` compose. The
 * git seam is injected (three-layer architecture); it is **best-effort** — any
 * failure (no remote, offline, unresolved ref) falls back to the local `base`,
 * preserving the pre-refresh behavior.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

/** The default remote whose base ref is authoritative. */
const DEFAULT_REMOTE = "origin";

/**
 * Fetch the remote base and return `<remote>/<base>` when it resolves, so a
 * post-merge containment / fast-forward check evaluates against the authoritative
 * remote ref rather than a possibly-stale local `base`. Best-effort — any failure
 * falls back to the local `base`.
 *
 * @param exec - Injected git executor.
 * @param base - The local base branch name.
 * @param remote - The remote whose base ref is authoritative (default `origin`).
 * @returns `<remote>/<base>` when fetched and resolvable, else the local `base`.
 */
export async function refreshBase(exec: GitExec, base: string, remote?: string): Promise<string> {
  const remoteName = remote ?? DEFAULT_REMOTE;
  const remoteBase = `${remoteName}/${base}`;
  try {
    await exec("git", ["fetch", remoteName, base]);
    await exec("git", ["rev-parse", "--verify", "--quiet", remoteBase]);
    return remoteBase;
  } catch {
    return base;
  }
}
