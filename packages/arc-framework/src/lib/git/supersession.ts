/**
 * Patch-equal supersession detector — distinguishes local-ahead commits that
 * have been rebased onto the remote (and so are losslessly discardable) from
 * genuinely-divergent local work.
 *
 * The append-only backstop: when a shared branch is rebased and force-pushed
 * elsewhere, the local copy diverges even though its commits survive on the
 * remote as patch-equal equivalents. A generic "manual rebase or merge needed"
 * reconcile understates this — the local commits are superseded, and a
 * `git reset --hard origin/<branch>` recovers cleanly with no lost work. This
 * detector identifies that case so the diverged handler can downgrade its
 * advisory accordingly.
 *
 * Mechanism: `git cherry origin/<branch> HEAD` lists the local-ahead commits
 * (HEAD not in the merge-base with the remote) and marks each by patch-id —
 * `-` when an equivalent exists upstream, `+` when it is novel. Bounded to the
 * local-ahead set by construction; no full-history scan. Read-only and
 * advisory: any failure degrades to "not superseded" rather than throwing.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

export interface SupersessionResult {
  /**
   * True when there is at least one local-ahead commit AND every one of them is
   * patch-equal to a remote-side equivalent — the reset-is-lossless case. False
   * on genuine divergence, partial overlap (some novel local commits remain),
   * an empty local-ahead set, or any degraded read.
   */
  superseded: boolean;
  /** Local-ahead commits with a patch-equal remote equivalent (cherry `-`). */
  supersededCommits: string[];
  /** Local-ahead commits with no patch-equal remote equivalent (cherry `+`) — genuinely novel. */
  novelCommits: string[];
}

export interface DetectSupersessionOptions {
  exec: GitExec;
  /** Current branch; the remote prefix compared against is `origin/<branch>`. */
  branch: string;
}

/**
 * Detect whether the local-ahead commit set is patch-equal to a rebased remote
 * prefix.
 *
 * @param options - Git executor and the current branch name.
 * @returns The supersession verdict plus the per-commit superseded/novel split.
 */
export async function detectSupersession(
  options: DetectSupersessionOptions,
): Promise<SupersessionResult> {
  const { exec, branch } = options;

  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["cherry", `origin/${branch}`, "HEAD"]));
  } catch {
    // Advisory: a bad ref or any other failure resolves to "not superseded"
    // rather than failing the probe.
    return { superseded: false, supersededCommits: [], novelCommits: [] };
  }

  const supersededCommits: string[] = [];
  const novelCommits: string[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const sign = trimmed[0];
    const sha = trimmed.slice(1).trim();
    if (sign === "-") supersededCommits.push(sha);
    else if (sign === "+") novelCommits.push(sha);
  }

  // A clean supersession requires every local-ahead commit to have a remote
  // equivalent: one novel commit means a reset would lose work.
  const superseded = supersededCommits.length > 0 && novelCommits.length === 0;
  return { superseded, supersededCommits, novelCommits };
}
