/** Sync's materializing preflight and recoverable timeout presentation. */
import type { GitExec } from "../lib/git/exec.js";
import {
  runMaterializingWorktreeInspection,
  WorktreeFetchTimeoutError,
  type WorktreeMaterializingInspectionResult,
} from "../lib/git/worktree-sync.js";
import type { SyncOutput } from "../lib/sync-output.js";
import type { SyncOptions } from "./sync.js";

/**
 * Acquire exact worktree evidence or report the fetch deadline without starting sync legs.
 * @param input - Invocation's Git boundary, checkout, flags, and output.
 * @returns Exact inspection, or null after a recoverable timeout is reported.
 */
export async function inspectSyncWorktree(input: {
  exec: GitExec;
  cwd: string;
  opts: SyncOptions;
  output: SyncOutput;
}): Promise<WorktreeMaterializingInspectionResult | null> {
  const { exec, cwd, opts, output } = input;
  try {
    return await runMaterializingWorktreeInspection({ exec, cwd });
  } catch (error) {
    if (!(error instanceof WorktreeFetchTimeoutError)) throw error;
    output.log.error(error.message);
    process.exitCode = 1;
    if (opts.json === true) {
      const argv = ["arc", "sync", "--json",
        ...(opts.dryRun ? ["--dry-run"] : []), ...(opts.yes ? ["--yes"] : [])];
      process.stdout.write(`${JSON.stringify({
        cell: "none", reason: "worktree-fetch-timeout", exitCode: 1,
        branch: error.branch, remoteBranch: error.remoteBranch, timeoutMs: error.timeoutMs,
        detail: error.message, recommendedSummaryLine: `**Sync interrupted:** ${error.message}`,
        remedy: { text: "Retry the same sync command when the remote responds.", argv },
      }, null, 2)}\n`);
    }
    return null;
  }
}
