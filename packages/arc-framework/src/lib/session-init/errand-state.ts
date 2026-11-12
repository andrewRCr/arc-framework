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

import type { Store } from "../store/contract.js";
import { acquireStoreErrands, type StoreIdentityAcquisition } from "../errand/store-discovery.js";
import { storeInFlightLocationUnavailable, type StoreInFlightEntry } from "../git/in-flight-store.js";
import type { z } from "zod";
import { ErrandStateResultSchema } from "./errand-state-schema.js";
import type { GitExec } from "../git/exec.js";
import type { InFlightEntry, InFlightErrand, InFlightResidue } from "../git/in-flight-derivation.js";
import { isLandedInBaseStrict } from "../git/branch-containment.js";
import type { TransientIdentityRecord } from "../errand/identity-record.js";

import { detectErrandResume } from "./errand-resume-detection.js";
import type { NudgeMarkerState } from "./nudge-rate-limit.js";
import {
  classifyInFlightErrands,
  type InFlightErrandReport,
  type InFlightErrandSweepResult,
} from "./in-flight-errand-sweep.js";
import {
  findMaterializableErrands, ownedActiveErrandRecords,
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
export type ErrandStateResult = z.infer<typeof ErrandStateResultSchema>;
export interface RunErrandStateOptions {
  store?: Store;
  identity?: string | null;
  errandAcquisition?: StoreIdentityAcquisition;
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
  entries: readonly (InFlightEntry | StoreInFlightEntry)[] | null;
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
  /** A failed local-ref read cannot authorize an offer from a later identity acquisition. */
  localRefsAvailable?: boolean;
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
export async function runErrandState(input: RunErrandStateOptions): Promise<ErrandStateResult> {
  const options = await bindStoreErrandRecords(input);
  let projectedEvidence = projectCleanupRemoteEvidence(options.baseBranch, options.baseEvidence);
  const oracleWarnings = [...(options.oracleWarnings ?? [])];
  const residue = (options.residue ?? []).map((item) => ({ ...item,
    actions: [{ text: `Inspect Errand residue \`${item.slug}\` on \`${item.branch}\` (${item.reason}); resolve the missing record, branch, or classification before cleanup.` }],
  }));
  // Branch→slug index: the record-derived identity oracle the probes resolve against.
  const slugByBranch = new Map(options.records.flatMap((record) =>
    record.branch === null ? [] : [[record.branch, record.slug] as const]));

  const detectedResume = detectErrandResume({
    currentBranch: options.currentBranch,
    hasBackingMeta: options.hasBackingMeta,
    slugByBranch,
  });
  const resume = detectedResume.resumable
    ? { ...detectedResume, actions: [{ text: `Resume Errand \`${detectedResume.slug}\` on the current branch with the run-errand workflow.` }] }
    : detectedResume;

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
    records: materializableRecords(options),
    remoteTips: options.remoteTips,
    locallyPresentBranches: options.locallyPresentBranches ?? new Set(),
  });
  const errands = options.entries.filter(
    (entry): entry is InFlightErrand => entry.kind === "errand" && typeof entry.branch === "string",
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

function materializableRecords(options: RunErrandStateOptions): readonly TransientIdentityRecord[] {
  if (!options.recordsComplete || options.localRefsAvailable === false) return [];
  if (options.store?.capabilities.stateOffBranch !== true) return options.records;
  return options.records.filter(record => !options.entries?.some(entry => entry.branch === record.branch && storeInFlightLocationUnavailable(entry)));
}

/** Resolve one Errand merge proof from supplied advertised evidence when present. */
async function resolveErrandMerged(
  options: RunErrandStateOptions,
  entry: InFlightErrand,
): Promise<{ merged: boolean | null; remoteEvidence?: "pending-fetch" }> {
  if (options.store?.capabilities.stateOffBranch === true && storeErrandLocationUnavailable(options, entry)) return { merged: null };
  const evidence = options.baseEvidence;
  if (evidence === undefined) return { merged: null };
  if (!evidence.remoteSyncEnabled || evidence.snapshot.kind === "unreachable") return { merged: null };
  const baseOid = evidence.snapshot.tips[options.baseBranch];
  if (baseOid === undefined) return { merged: null };
  if (!errandCommitIsLocal(evidence, baseOid, "base")) return { merged: null, remoteEvidence: "pending-fetch" };
  const source = entry.remoteOnly ? options.remoteTips.get(entry.branch) : entry.branch;
  if (source === undefined) return { merged: null };
  if (entry.remoteOnly && !errandCommitIsLocal(evidence, source, "Errand")) return { merged: null, remoteEvidence: "pending-fetch" };
  if (evidence.history.kind === "shallow") return { merged: null };
  if (evidence.history.kind !== "complete") throw new Error("Errand history completeness could not be inspected.");
  const localOnlyExec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    objectAccess: "local-only",
  });
  return { merged: await isLandedInBaseStrict(localOnlyExec, source, baseOid) };
}

function storeErrandLocationUnavailable(options: RunErrandStateOptions, entry: InFlightErrand): boolean {
  return storeInFlightLocationUnavailable(entry) || (options.localRefsAvailable === false && entry.worktreePath === undefined);
}

function errandCommitIsLocal(evidence: CleanupBaseEvidence, oid: string, label: "base" | "Errand"): boolean {
  if (evidence.objectAvailability.kind !== "complete") throw new Error("Advertised Errand merge object availability could not be inspected.");
  const available = evidence.objectAvailability.commits[oid];
  if (available === undefined) throw new Error(`The advertised ${label} commit has no local availability fact.`);
  return available;
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
  resume: ErrandStateResult["resume"],
  nudge: ErrandNudgeState,
  residue: ErrandStateResult["residue"],
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

async function bindStoreErrandRecords(options: RunErrandStateOptions): Promise<RunErrandStateOptions> {
  if (options.store?.capabilities.stateOffBranch !== true) return options;
  const acquired = options.errandAcquisition ?? await acquireStoreErrands(options.store);
  const warnings = acquired.kind === "error" ? [acquired.message]
    : acquired.kind === "complete" ? acquired.diagnostics.map(item => `${item.condition} ${item.remedy.text}`) : [];
  if (acquired.kind === "complete" && acquired.missed && warnings.length === 0) warnings.push("Errand inventory is incomplete; repair the missing record observations before materializing an Errand.");
  return { ...options, records: ownedActiveErrandRecords(acquired, options.identity ?? null),
    recordsComplete: acquired.kind === "absent" || (acquired.kind === "complete" && !acquired.missed && acquired.diagnostics.length === 0),
    oracleWarnings: [...(options.oracleWarnings ?? []), ...warnings] };
}
