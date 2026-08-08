/**
 * Errand-state composer for session-init.
 *
 * The I/O boundary around the pure errand helpers. Exact v3 identities provide
 * both branch classification and materialization authority.
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
import type { InFlightEntry, InFlightErrand, InFlightResidue } from "../git/in-flight-derivation.js";
import { isLandedInBaseStrict } from "../git/branch-containment.js";
import type { TransientIdentityRecord } from "../errand/identity-record.js";

import { detectErrandResume, type ErrandResumeResult } from "./errand-resume-detection.js";
import type { NudgeMarkerState } from "./nudge-rate-limit.js";
import {
  classifyInFlightErrands,
  type InFlightErrandReport,
  type InFlightErrandSweepResult,
} from "./in-flight-errand-sweep.js";
import {
  findMaterializableErrands,
  type MaterializableErrandsResult,
} from "./materializable-errands.js";
import {
  projectCleanupRemoteEvidence,
  type CleanupBaseEvidence,
  type CleanupRemoteEvidence,
} from "./cleanup-remote-evidence.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Marker state for the rate-limited reminder / stale-errand nudge. */
export type ErrandNudgeState = NudgeMarkerState;

/** Composite errand state exposed by the session-init envelope. */
export type ErrandStateResult = CleanupRemoteEvidence & {
  /** Current-branch resume signal — cheap and always computed. */
  resume: ErrandResumeResult;
  /** Orient-only advisory over the oracle's in-flight `chore/` errands. */
  inFlight: InFlightErrandSweepResult;
  /** Exact ordinary-v3 tails that can be materialized locally. */
  materializable: MaterializableErrandsResult;
  /** Branch/record residue surfaced for advisory cleanup. */
  residue: InFlightResidue[];
  /** Rate-limit state shared by reminder and stale-errand surfaces. */
  nudge: ErrandNudgeState;
  /** Soft diagnostics; discovery failures should not block session-init. */
  warnings: string[];
};
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
  /** Oracle-derived residue; remains visible when entry discovery is unavailable. */
  residue?: readonly InFlightResidue[];
  /** Soft diagnostics already emitted by the in-flight oracle. */
  oracleWarnings?: readonly string[];
  /** Exact v3 identities used for branch classification and materialization. */
  records: readonly TransientIdentityRecord[];
  /** Whether the transient identity snapshot was decoded completely. */
  recordsComplete: boolean;
  /** Live remote tips keyed by branch short-name. */
  remoteTips: ReadonlyMap<string, string>;
  /**
   * Branches already represented by a local head or worktree. Omitted only by
   * compatibility callers pending composition cutover; an omitted set defaults to
   * empty, which disables the local-presence exclusion rather than tightening it.
   */
  locallyPresentBranches?: ReadonlySet<string>;
  /** Supplied advertised-base prerequisites; omitted only by compatibility callers pending composition cutover. */
  baseEvidence?: CleanupBaseEvidence;
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
  let projectedEvidence = projectCleanupRemoteEvidence(options.baseBranch, options.baseEvidence);
  const oracleWarnings = [...(options.oracleWarnings ?? [])];
  const residue = [...(options.residue ?? [])];
  // Branch→slug index: the record-derived identity oracle the probes resolve against.
  const slugByBranch = new Map(options.records.flatMap((record) =>
    record.branch === null ? [] : [[record.branch, record.slug] as const]));

  const resume = detectErrandResume({
    currentBranch: options.currentBranch,
    hasBackingMeta: options.hasBackingMeta,
    slugByBranch,
  });

  if (!options.includeDiscovery) {
    return emptyDiscovery(projectedEvidence, resume, options.nudge, residue, oracleWarnings);
  }
  if (options.entries === null) {
    return emptyDiscovery(
      projectedEvidence,
      resume,
      options.nudge,
      residue,
      [...oracleWarnings, "Errand discovery skipped because the in-flight oracle was unavailable."],
    );
  }

  const materializable = findMaterializableErrands({
    records: options.recordsComplete ? options.records : [],
    remoteTips: options.remoteTips,
    locallyPresentBranches: options.locallyPresentBranches ?? new Set(),
  });
  const errands = options.entries.filter(
    (entry): entry is InFlightErrand => entry.kind === "errand",
  );
  if (errands.length === 0) {
    return {
      ...projectedEvidence,
      resume,
      inFlight: { errands: [] },
      materializable,
      residue,
      nudge: options.nudge,
      warnings: oracleWarnings,
    };
  }

  const timestamps = await readErrandTimestamps(options.exec);
  const nowMs = Date.parse(options.now ?? new Date().toISOString());

  const mergedByBranch = new Map<string, boolean | null>();
  await Promise.all(
    errands.map(async (entry) => {
      const resolution = await resolveErrandMerged(options, entry);
      mergedByBranch.set(entry.branch, resolution.merged);
      if (resolution.remoteEvidence === "pending-fetch") {
        projectedEvidence = { remoteEvidence: "pending-fetch" };
      }
    }),
  );

  const classified = classifyInFlightErrands({
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
  const inFlight: InFlightErrandSweepResult = {
    errands: classified.errands.map((report): InFlightErrandReport =>
      mergedByBranch.get(report.branch) === null
        ? {
            slug: report.slug,
            branch: report.branch,
            state: "blocked",
            blockingReason: "evidence-unavailable",
            ageDays: report.ageDays,
          }
        : report),
  };

  return {
    ...projectedEvidence,
    resume,
    inFlight,
    materializable,
    residue,
    nudge: options.nudge,
    warnings: [...oracleWarnings, ...timestamps.warnings],
  };
}

/** Resolve one Errand merge proof from supplied advertised evidence when present. */
async function resolveErrandMerged(
  options: RunErrandStateOptions,
  entry: InFlightErrand,
): Promise<{ merged: boolean | null; remoteEvidence?: "pending-fetch" }> {
  const evidence = options.baseEvidence;
  if (evidence === undefined) return { merged: null };
  if (!evidence.remoteSyncEnabled || evidence.snapshot.kind === "unreachable") return { merged: null };
  const baseOid = evidence.snapshot.tips[options.baseBranch];
  if (baseOid === undefined) return { merged: null };
  if (evidence.objectAvailability.kind !== "complete") {
    throw new Error("Advertised Errand merge object availability could not be inspected.");
  }
  const baseCommitIsLocal = evidence.objectAvailability.commits[baseOid];
  if (baseCommitIsLocal === false) return { merged: null, remoteEvidence: "pending-fetch" };
  if (baseCommitIsLocal === undefined) {
    throw new Error("The advertised base commit has no local availability fact.");
  }
  const source = entry.remoteOnly ? options.remoteTips.get(entry.branch) : entry.branch;
  if (source === undefined) return { merged: null };
  if (entry.remoteOnly) {
    const sourceCommitIsLocal = evidence.objectAvailability.commits[source];
    if (sourceCommitIsLocal === false) return { merged: null, remoteEvidence: "pending-fetch" };
    if (sourceCommitIsLocal === undefined) {
      throw new Error("The advertised Errand commit has no local availability fact.");
    }
  }
  if (evidence.history.kind === "shallow") return { merged: null };
  if (evidence.history.kind !== "complete") throw new Error("Errand history completeness could not be inspected.");
  const localOnlyExec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    objectAccess: "local-only",
  });
  return { merged: await isLandedInBaseStrict(localOnlyExec, source, baseOid) };
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
  evidence: CleanupRemoteEvidence,
  resume: ErrandResumeResult,
  nudge: ErrandNudgeState,
  residue: InFlightResidue[],
  warnings: string[],
): ErrandStateResult {
  return {
    ...evidence,
    resume,
    inFlight: { errands: [] },
    materializable: { candidates: [] },
    residue,
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
