/** Locus lookups used to bind review handlers to their current checkout. */

import { readConfigSettings } from "../lib/config/status-reader.js";
import type { GitExec } from "../lib/git/exec.js";
import {
  resolveActiveHostedReviewErrand,
  type ActiveHostedReviewErrand,
} from "../scripts/review-gate/hosted/errand-authority.js";
import { runDerivedLocusStateProbe } from "./derived-locus-state-probe.js";
import { resolveUserIdentity } from "./shared.js";

function completedReviewTerminusContext(
  frame: Awaited<ReturnType<typeof runDerivedLocusStateProbe>>,
  workUnitId: string,
) {
  const row = frame.entering.kind === "selected" ? frame.entering.row : null;
  return row?.kind === "work-unit"
    && row.lifecycleLocation === "completed"
    && row.subject.kind === "work-unit"
    && row.subject.key === workUnitId
    && row.context !== null
    && frame.active?.checkoutPath === row.checkout.path
    && frame.active.subject.key === workUnitId
    ? row.context
    : null;
}

/** Owner and active identity read from the exact completed work-unit checkout. */
export interface CompletedReviewTerminusOwner {
  readonly owner: string | null;
  readonly identity: string;
}

/**
 * Read completed-work-unit ownership from the selected current checkout.
 *
 * @param root - Current repository checkout.
 * @param workUnitId - Exact work unit expected in that checkout.
 * @param exec - Git process boundary used for identity and locus reads.
 * @returns Owner and identity, or null when no matching completed context exists.
 */
export async function readCompletedReviewTerminusOwner(
  root: string,
  workUnitId: string,
  exec: GitExec,
): Promise<CompletedReviewTerminusOwner | null> {
  const [{ settings }, identity] = await Promise.all([
    readConfigSettings(root),
    resolveUserIdentity(exec),
  ]);
  const frame = await runDerivedLocusStateProbe({
    cwd: root,
    identity,
    baseBranch: settings["branch.base"],
    exec,
  });
  const completed = completedReviewTerminusContext(frame, workUnitId);
  return completed === null ? null : { owner: completed.owner, identity };
}

/**
 * Resolve the active ordinary Errand for a hosted-review branch.
 *
 * @param root - Current repository checkout.
 * @param branch - Attached branch expected by the review target.
 * @param baseRef - Base branch used by the locus probe.
 * @param exec - Git process boundary used for identity and locus reads.
 * @returns The exact active Errand identity, throwing when it cannot be established.
 */
export async function resolveCurrentHostedReviewErrand(
  root: string,
  branch: string,
  baseRef: string,
  exec: GitExec,
): Promise<ActiveHostedReviewErrand> {
  const identity = await resolveUserIdentity(exec);
  const frame = await runDerivedLocusStateProbe({
    cwd: root,
    identity,
    baseBranch: baseRef,
    exec,
  });
  return resolveActiveHostedReviewErrand(frame, branch);
}

/**
 * Read the active Errand claim from the current branch and configured base.
 *
 * @param root - Current repository checkout.
 * @param exec - Git process boundary used for branch, identity, and locus reads.
 * @returns The exact indexed Errand identity, throwing when it cannot be established.
 */
export async function readIndexedHostedReviewErrand(
  root: string,
  exec: GitExec,
): Promise<ActiveHostedReviewErrand> {
  const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root })).stdout.trim();
  const frame = await runDerivedLocusStateProbe({
    cwd: root,
    identity: await resolveUserIdentity(exec),
    baseBranch: (await readConfigSettings(root)).settings["branch.base"],
    exec,
  });
  return resolveActiveHostedReviewErrand(frame, branch);
}
