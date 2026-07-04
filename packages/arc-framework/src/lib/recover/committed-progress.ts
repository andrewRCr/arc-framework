/**
 * Committed-progress evidence for recovery-audit drift classification.
 *
 * A compaction seed goes stale the moment the session commits work after it was
 * emitted: the recorded dirty set and load-set no longer match the fresh probe,
 * even though nothing is actually inconsistent. This resolves the git evidence —
 * whether HEAD advanced past the seed's recorded head, and which files changed in
 * the intervening commits — so the audit can tell expected progression from
 * genuine drift.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import { gitExec } from "../io-context.js";

/** Git evidence that the session committed progress after the seed was emitted. */
export interface CommittedProgress {
  /** The seed head is a strict ancestor of HEAD — HEAD advanced past it. */
  advanced: boolean;
  /** Repo-relative paths changed by commits in `seedHead..HEAD`; empty unless advanced. */
  files: ReadonlySet<string>;
}

/** Resolver signature the audit injects (defaulted in production, faked in tests). */
export type CommittedProgressResolver = (seedHead: string) => Promise<CommittedProgress | null>;

/** Inputs for {@link resolveCommittedProgress}. */
export interface ResolveCommittedProgressOptions {
  exec: GitExec;
  seedHead: string;
  cwd?: string;
}

const shaPattern = /^[0-9a-f]{7,40}$/iu;

/**
 * Resolve committed-progress evidence between a seed head and current HEAD.
 *
 * Returns `null` whenever the relationship can't be established — a malformed or
 * unknown seed head, or any git failure. The audit treats an unresolved result as
 * *unexplained* and stops, so a failure here can only ever make the gate stricter,
 * never looser.
 */
export async function resolveCommittedProgress(
  options: ResolveCommittedProgressOptions,
): Promise<CommittedProgress | null> {
  const seedHead = options.seedHead.trim();
  if (!shaPattern.test(seedHead)) return null;
  const execOptions = options.cwd === undefined ? undefined : { cwd: options.cwd };

  try {
    const seedSha = await revParseCommit(options.exec, seedHead, execOptions);
    const headSha = await revParseCommit(options.exec, "HEAD", execOptions);
    if (seedSha === null || headSha === null) return null;
    if (seedSha === headSha) return { advanced: false, files: new Set() };

    const base = (await options.exec("git", ["merge-base", seedSha, headSha], execOptions)).stdout.trim();
    // Seed head must be a strict ancestor of HEAD: only then is the dirty/load-set
    // delta attributable to commits made since. A diverged or unrelated seed head
    // is not "committed progress" and stays unexplained.
    if (base !== seedSha) return { advanced: false, files: new Set() };

    const diff = (
      await options.exec("git", ["diff", "--name-only", "-z", `${seedSha}..${headSha}`], execOptions)
    ).stdout;
    const files = new Set(
      diff.split("\0").map((path) => path.trim()).filter((path) => path.length > 0),
    );
    return { advanced: true, files };
  } catch {
    return null;
  }
}

async function revParseCommit(
  exec: GitExec,
  ref: string,
  execOptions: { cwd: string } | undefined,
): Promise<string | null> {
  const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], execOptions);
  const sha = stdout.trim();
  return sha.length > 0 ? sha : null;
}

/** Production resolver bound to the process-level git executor. */
export const defaultCommittedProgressResolver: CommittedProgressResolver = (seedHead) =>
  resolveCommittedProgress({ exec: gitExec, seedHead });
