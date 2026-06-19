/**
 * Errand-state composer for session-init.
 *
 * The I/O boundary around the pure errand helpers. Identity is record-backed:
 * the injected errand records form a branch→slug index that resolves each
 * errand's slug (a record-less branch degrades to the branch-derived slug).
 * Presence and merge status stay oracle-backed. It detects a resumable current
 * branch (cheap, always), and — when discovery is on — classifies the oracle's
 * in-flight errand entries and selects the remote-only ones as materialize
 * candidates. The oracle's pruned-ref view supplies each errand's presence and
 * location (`remoteOnly`); this layer adds only the per-errand merge +
 * committer-date reads the classification needs. Open-PR state rides the oracle
 * entry's `pr` enrichment (refs-only until a PR source is wired), so no bespoke
 * forge probe lives here.
 *
 * The dead-ref `git fetch --prune` is no longer part of this path — the oracle
 * is prune-independent (it intersects local refs with live remote membership),
 * so the prune survives only as a standalone session-init hygiene backstop
 * (see {@link pruneRemoteTrackingRefs}).
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import type { InFlightEntry, InFlightErrand } from "../git/in-flight-derivation.js";
import { isBranchMerged } from "../git/worktree-cleanup.js";
import type { ErrandRecord } from "../errand/record.js";

import { detectErrandResume, type ErrandResumeResult } from "./errand-resume-detection.js";
import type { NudgeMarkerState } from "./nudge-rate-limit.js";
import {
  classifyInFlightErrands,
  type InFlightErrandSweepResult,
} from "./in-flight-errand-sweep.js";
import {
  findMaterializableErrands,
  type MaterializableErrandsResult,
} from "./materializable-errands.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Marker state for the rate-limited reminder / stale-errand nudge. */
export type ErrandNudgeState = NudgeMarkerState;

/** Composite errand state exposed by the session-init envelope. */
export interface ErrandStateResult {
  /** Current-branch resume signal — cheap and always computed. */
  resume: ErrandResumeResult;
  /** Orient-only advisory over the oracle's in-flight `chore/` errands. */
  inFlight: InFlightErrandSweepResult;
  /** Remote-only `chore/` errands that can be materialized locally. */
  materializable: MaterializableErrandsResult;
  /** Rate-limit state shared by reminder and stale-errand surfaces. */
  nudge: ErrandNudgeState;
  /** Soft diagnostics; discovery failures should not block session-init. */
  warnings: string[];
}

export interface RunErrandStateOptions {
  exec: GitExec;
  currentBranch: string | null;
  hasBackingMeta: boolean;
  /** Discovery is an Orient-arm concern; false leaves in-flight/materialize empty. */
  includeDiscovery: boolean;
  /**
   * Oracle-derived in-flight entries (work units and errands). `null` when
   * discovery is off or the oracle was unavailable (unreachable remote): both
   * leave in-flight/materialize empty.
   */
  entries: readonly InFlightEntry[] | null;
  /**
   * Errand records (identity-scoped) — the identity oracle for resume and
   * discovery. Empty when identity is absent or the errand ref is unborn; a
   * record-less errand branch then degrades to its branch-derived slug.
   */
  records: readonly ErrandRecord[];
  /** Integration base branch short-name, e.g. `main`. */
  baseBranch: string;
  /** Whole-day threshold for classifying in-progress branches as stale. */
  staleThresholdDays: number;
  /** Pre-computed nudge rate-limit state. */
  nudge: ErrandNudgeState;
  /** ISO-8601 reference time for deterministic age calculations. */
  now?: string;
}

/**
 * Compose the session-init errand state from the oracle's in-flight entries.
 *
 * @param options - Git adapter, current-branch context, oracle entries, config, and nudge state.
 * @returns Composite errand state for the session-init envelope.
 */
export async function runErrandState(options: RunErrandStateOptions): Promise<ErrandStateResult> {
  // Branch→slug index: the record-derived identity oracle the probes resolve against.
  const slugByBranch = new Map(options.records.map((record) => [record.branch, record.slug]));

  const resume = detectErrandResume({
    currentBranch: options.currentBranch,
    hasBackingMeta: options.hasBackingMeta,
    slugByBranch,
  });

  if (!options.includeDiscovery) {
    return emptyDiscovery(resume, options.nudge, []);
  }
  if (options.entries === null) {
    return emptyDiscovery(
      resume,
      options.nudge,
      ["Errand discovery skipped because the in-flight oracle was unavailable."],
    );
  }

  const materializable = findMaterializableErrands({ entries: options.entries, slugByBranch });
  const errands = options.entries.filter(
    (entry): entry is InFlightErrand => entry.kind === "errand",
  );
  if (errands.length === 0) {
    return { resume, inFlight: { errands: [] }, materializable, nudge: options.nudge, warnings: [] };
  }

  const timestamps = await readErrandTimestamps(options.exec);
  const nowMs = Date.parse(options.now ?? new Date().toISOString());

  const mergedByBranch = new Map<string, boolean>();
  await Promise.all(
    errands.map(async (entry) => {
      const merged = await isBranchMerged({
        exec: options.exec,
        branch: mergeRefOf(entry),
        target: `origin/${options.baseBranch}`,
      });
      mergedByBranch.set(entry.branch, merged);
    }),
  );

  const inFlight = classifyInFlightErrands({
    staleThresholdDays: options.staleThresholdDays,
    branches: errands.map((entry) => ({
      // Identity from the record; a record-less branch degrades to the oracle's branch-derived slug.
      slug: slugByBranch.get(entry.branch) ?? entry.slug,
      branch: entry.branch,
      hasOpenPr: entry.pr !== undefined,
      merged: mergedByBranch.get(entry.branch) ?? false,
      ageDays: ageDays(timestampOf(entry, timestamps), nowMs),
    })),
  });

  return { resume, inFlight, materializable, nudge: options.nudge, warnings: timestamps.warnings };
}

/** Ref the merge check runs against — `origin/<branch>` for remote-only, the local branch otherwise. */
function mergeRefOf(entry: InFlightErrand): string {
  return entry.remoteOnly ? `origin/${entry.branch}` : entry.branch;
}

/** Committer-date timestamp for an errand, preferring the local ref when checked out here. */
function timestampOf(
  entry: InFlightErrand,
  timestamps: ErrandTimestamps,
): number | null {
  if (entry.remoteOnly) return timestamps.remote.get(entry.branch) ?? null;
  return timestamps.local.get(entry.branch) ?? timestamps.remote.get(entry.branch) ?? null;
}

function emptyDiscovery(
  resume: ErrandResumeResult,
  nudge: ErrandNudgeState,
  warnings: string[],
): ErrandStateResult {
  return {
    resume,
    inFlight: { errands: [] },
    materializable: { candidates: [] },
    nudge,
    warnings,
  };
}

function ageDays(timestamp: number | null, nowMs: number): number {
  if (timestamp === null || Number.isNaN(nowMs)) return 0;
  return Math.max(0, Math.floor((nowMs - timestamp * 1000) / MS_PER_DAY));
}

interface ErrandTimestamps {
  /** Branch → committer-date (unix) for `refs/heads/*`. */
  local: Map<string, number>;
  /** Branch → committer-date (unix) for `refs/remotes/origin/*`. */
  remote: Map<string, number>;
  warnings: string[];
}

/**
 * Read committer-date timestamps for the branch refs in one `for-each-ref`,
 * split into local (`refs/heads`) and remote (`refs/remotes/origin`) maps. A
 * read failure degrades to empty maps plus a soft warning — ages fall back to 0
 * rather than blocking the sweep.
 */
async function readErrandTimestamps(exec: GitExec): Promise<ErrandTimestamps> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", [
      "for-each-ref",
      "--format=%(refname)\t%(committerdate:unix)",
      "refs/heads",
      "refs/remotes/origin",
    ]));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { local: new Map(), remote: new Map(), warnings: [`Errand branch enumeration failed: ${message}`] };
  }

  const local = new Map<string, number>();
  const remote = new Map<string, number>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const [refName, timestampRaw] = trimmed.split("\t");
    if (refName === undefined || timestampRaw === undefined) continue;
    const timestamp = Number.parseInt(timestampRaw, 10);
    if (Number.isNaN(timestamp)) continue;

    if (refName.startsWith("refs/heads/")) {
      const branch = refName.slice("refs/heads/".length);
      if (branch !== "") local.set(branch, timestamp);
      continue;
    }
    if (refName.startsWith("refs/remotes/origin/")) {
      const branch = refName.slice("refs/remotes/origin/".length);
      if (branch !== "" && branch !== "HEAD") remote.set(branch, timestamp);
    }
  }
  return { local, remote, warnings: [] };
}
