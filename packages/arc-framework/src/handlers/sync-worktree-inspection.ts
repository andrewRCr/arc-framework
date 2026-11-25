/** Sync's worktree evidence and recoverable fetch-failure presentation. */
import type { GitExec } from "../lib/git/exec.js";
import { localLifecycleTip } from "../lib/git/lifecycle-ref-refresh.js";
import {
  runMaterializingWorktreeInspection,
  WorktreeFetchFailedError,
  WorktreeFetchTimeoutError,
  type WorktreeMaterializingInspectionResult,
} from "../lib/git/worktree-sync.js";
import type { Store } from "../lib/store/contract.js";
import { resolveCurrentWorkUnit } from "../lib/store/current-work-unit.js";
import type { SyncOutput } from "../lib/sync-output.js";
import type { InterlockState, LegOutcomeRecord, SyncOptions } from "./sync.js";
import { writeSyncAuditEntry } from "./sync-audit.js";

/** Verify a clean detached checkout held by a Planning work unit at a known base tip. */
export async function isDetachedPlanningAtBase(input: {
  exec: GitExec;
  cwd: string;
  store: Store;
  baseBranch: string;
}): Promise<boolean> {
  const { exec, cwd, store, baseBranch } = input;
  try {
    const current = await resolveCurrentWorkUnit({ cwd, store });
    if (current.status !== "resolved" || current.warnings.length !== 0
      || current.candidate.record?.state !== "Planning") return false;

    const [local, tracking] = await Promise.all([
      localLifecycleTip(exec, cwd, `refs/heads/${baseBranch}`),
      localLifecycleTip(exec, cwd, `refs/remotes/origin/${baseBranch}`),
    ]);
    const { stdout } = await exec("git",
      ["--no-optional-locks", "status", "--porcelain=v2", "--branch", "--no-show-stash",
        "--untracked-files=normal", "--ignore-submodules=none"],
      { cwd, objectAccess: "local-only" });
    const lines = stdout.trimEnd().split(/\r?\n/u);
    return lines.length === 2 && lines[1] === "# branch.head (detached)"
      && [local, tracking].some((tip) => tip !== null && lines[0] === `# branch.oid ${tip}`);
  } catch {
    return false;
  }
}

interface FetchFailurePresentation {
  error: WorktreeFetchTimeoutError | WorktreeFetchFailedError;
  reason: "worktree-fetch-timeout" | "worktree-fetch-failed";
  legDetail: "timeout" | "error";
  fields: Record<string, unknown>;
  remedy: string;
}

/**
 * Acquire exact worktree evidence or report a failed fetch without starting sync legs.
 * @param input - Invocation's Git boundary, checkout, flags, and output.
 * @returns Exact inspection, or null after a recoverable fetch failure is reported.
 */
export async function inspectSyncWorktree(input: {
  exec: GitExec;
  cwd: string;
  opts: SyncOptions;
  output: SyncOutput;
  identity: string;
  interlockState: InterlockState;
  stateOffBranch: boolean;
}): Promise<WorktreeMaterializingInspectionResult | null> {
  const { exec, cwd, opts, output } = input;
  try {
    return await runMaterializingWorktreeInspection({ exec, cwd });
  } catch (caught) {
    const failure = presentFetchFailure(caught);
    if (failure === null) throw caught;
    const { error, reason } = failure;
    const skipped = (action: string): LegOutcomeRecord => ({ action, result: "skipped", detail: reason });
    const storeLeg = input.stateOffBranch
      ? { state: { pull: skipped("pull"), push: skipped("push") } }
      : { notes: skipped("skip") };
    if (!opts.dryRun) {
      await writeSyncAuditEntry({
        cwd, identity: input.identity, interlockState: input.interlockState,
        outcome: {
          cell: reason, exitCode: 1,
          worktree: { action: "fetch", result: "failed", detail: failure.legDetail },
          ...storeLeg,
        },
      });
    }
    output.log.error(error.message);
    process.exitCode = 1;
    if (opts.json === true) {
      const argv = ["arc", "sync", "--json",
        ...(opts.dryRun ? ["--dry-run"] : []), ...(opts.yes ? ["--yes"] : [])];
      process.stdout.write(`${JSON.stringify({
        cell: "none", reason, exitCode: 1,
        branch: error.branch, remoteBranch: error.remoteBranch, ...failure.fields,
        detail: error.message, recommendedSummaryLine: `**Sync interrupted:** ${error.message}`,
        remedy: { text: failure.remedy, argv },
      }, null, 2)}\n`);
    }
    return null;
  }
}

function presentFetchFailure(error: unknown): FetchFailurePresentation | null {
  if (error instanceof WorktreeFetchTimeoutError) {
    return {
      error, reason: "worktree-fetch-timeout", legDetail: "timeout",
      fields: { timeoutMs: error.timeoutMs },
      remedy: "Retry the same sync command when the remote responds.",
    };
  }
  if (error instanceof WorktreeFetchFailedError) {
    const { kind, exitCode, diagnosticStderr } = error.failure;
    return {
      error, reason: "worktree-fetch-failed", legDetail: "error",
      fields: { gitFailure: { kind, ...(exitCode === undefined ? {} : { exitCode }), stderr: diagnosticStderr } },
      remedy: "Retry the same sync command once the condition Git reported is resolved.",
    };
  }
  return null;
}
