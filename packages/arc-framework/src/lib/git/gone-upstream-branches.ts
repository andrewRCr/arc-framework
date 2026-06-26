/**
 * Gone-upstream local-branch enumeration.
 *
 * One local `git for-each-ref` over a ref prefix, returning the short names of
 * local branches whose configured upstream has been deleted on the remote —
 * `%(upstream:track)` reports `gone`. The cross-machine `plan/`-orphan reaper
 * reads this: a sibling's local-only `plan/ → <type>/` rename leaves the
 * non-activating machine with a `plan/<name>` branch tracking a now-deleted
 * upstream.
 *
 * Only the `gone` tracking state qualifies — branches with a live upstream
 * (ahead / behind / up-to-date) or no upstream at all are excluded. The fields
 * are NUL-joined so a branch name can never collide with the field separator. A
 * failed read yields `[]`: the enumeration is an advisory hygiene signal, never
 * fatal.
 *
 * The git seam is injected (three-layer architecture).
 *
 * @module
 */

import type { GitExec } from "./exec.js";

/** Field separator in the `for-each-ref` format — NUL, so branch names are unambiguous. */
const FIELD_SEP = "\u0000";

/** The `gone` token `%(upstream:track,nobracket)` emits when the upstream was deleted. */
const GONE_TOKEN = "gone";

/**
 * List the local branches under `refPrefix` whose upstream is gone.
 *
 * @param exec - Injected git executor.
 * @param refPrefix - The ref namespace to scan (e.g. `refs/heads/plan/`).
 * @returns Short branch names with a gone upstream; `[]` on any read failure.
 */
export async function listGoneUpstreamBranches(
  exec: GitExec,
  refPrefix: string,
): Promise<string[]> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", [
      "for-each-ref",
      "--format=%(refname:short)%00%(upstream:track,nobracket)",
      refPrefix,
    ]));
  } catch {
    return [];
  }

  const gone: string[] = [];
  for (const rawLine of stdout.split("\n")) {
    if (rawLine.trim() === "") continue;
    const sep = rawLine.indexOf(FIELD_SEP);
    if (sep === -1) continue;
    const name = rawLine.slice(0, sep);
    const track = rawLine.slice(sep + 1).trim();
    if (track === GONE_TOKEN) gone.push(name);
  }
  return gone;
}
