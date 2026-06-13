/**
 * Work-unit-state composer for session-init.
 *
 * The I/O boundary around the pure work-unit completion-tail helpers. The
 * presence tier reads each owned WU's branch-tip committer date, enumerates the
 * operator's in-flight (`Integrating`) work units from the roster, and
 * classifies them from tracked state alone — no network. A committer-date read
 * failure degrades to age 0 plus a soft warning rather than blocking the sweep.
 *
 * This is the WU-side analog of {@link runErrandState}; the mergeable-sharpening
 * tier (live PR state via an injected source) layers on top in a later step.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import type { WorktreeRosterEntry } from "../git/worktree-roster.js";

import {
  classifyInFlightWorkUnits,
  enumerateOwnedIntegratingWorkUnits,
  projectWorkUnitPresenceFacts,
  type InFlightWorkUnitSweepResult,
} from "./in-flight-work-unit-sweep.js";

/** Composite work-unit completion-sweep state exposed by the session-init envelope. */
export interface WorkUnitStateResult {
  /** The classified owned in-flight work units across the completion tail. */
  inFlight: InFlightWorkUnitSweepResult;
  /** Soft diagnostics; a degraded read should not block session-init. */
  warnings: string[];
}

export interface RunWorkUnitStateOptions {
  exec: GitExec;
  /** The identity-filtered worktree roster resolved by session-init. */
  roster: readonly WorktreeRosterEntry[];
  /** The operator's identity; `null` passes every roster entry. */
  identity: string | null;
  /** Whole-day threshold for classifying an awaiting-review WU as stale. */
  staleThresholdDays: number;
  /** ISO-8601 reference time for deterministic age calculation. */
  now?: string;
}

/**
 * Compose the session-init work-unit completion-sweep state — presence tier.
 *
 * Reads branch-tip committer dates, enumerates the operator's owned
 * `Integrating` work units from the roster, projects them onto the classifier's
 * fact shape using tracked state alone, and classifies the completion tail. No
 * network: every WU classifies as `awaiting-review` (or `stale` past the
 * threshold) until a PR source sharpens it.
 *
 * @param options - Git adapter, roster, identity, staleness threshold, and reference time.
 * @returns The composed work-unit completion-sweep state.
 */
export async function runWorkUnitState(
  options: RunWorkUnitStateOptions,
): Promise<WorkUnitStateResult> {
  const committerDates = await readLocalBranchCommitterDates(options.exec);

  const workUnits = enumerateOwnedIntegratingWorkUnits({
    roster: options.roster,
    identity: options.identity,
    committerDates: committerDates.dates,
  });
  const facts = projectWorkUnitPresenceFacts({
    workUnits,
    now: options.now ?? new Date().toISOString(),
  });
  const inFlight = classifyInFlightWorkUnits({
    workUnits: facts,
    staleThresholdDays: options.staleThresholdDays,
  });

  return { inFlight, warnings: committerDates.warnings };
}

interface BranchCommitterDates {
  /** Local branch → committer-date (unix seconds). */
  dates: Map<string, number>;
  warnings: string[];
}

/**
 * Read committer-date timestamps for local branch tips (`refs/heads`) in one
 * `for-each-ref`. Roster WUs are always checked out locally, so the local ref
 * is the staleness anchor. A read failure degrades to an empty map plus a soft
 * warning — ages fall back to 0 rather than blocking the sweep.
 */
async function readLocalBranchCommitterDates(exec: GitExec): Promise<BranchCommitterDates> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", [
      "for-each-ref",
      "--format=%(refname)\t%(committerdate:unix)",
      "refs/heads",
    ]));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { dates: new Map(), warnings: [`Work-unit branch committer-date read failed: ${message}`] };
  }

  const dates = new Map<string, number>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const [refName, timestampRaw] = trimmed.split("\t");
    if (refName === undefined || timestampRaw === undefined) continue;
    if (!refName.startsWith("refs/heads/")) continue;
    const timestamp = Number.parseInt(timestampRaw, 10);
    if (Number.isNaN(timestamp)) continue;
    const branch = refName.slice("refs/heads/".length);
    if (branch !== "") dates.set(branch, timestamp);
  }
  return { dates, warnings: [] };
}
