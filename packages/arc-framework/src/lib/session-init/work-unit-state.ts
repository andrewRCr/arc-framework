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
import type { HistoryCompletenessResult } from "../git/history-completeness.js";
import type { ObjectAvailabilityResult } from "../git/object-availability.js";
import type { RemoteHeadSnapshotResult } from "../git/remote-ref-reader.js";
import { normalizeGitRejection } from "../git/process-error.js";
import { countAheadBehindRef } from "../git/worktree-sync.js";
import type { WorktreeRosterEntry } from "../git/worktree-roster.js";

import {
  classifyInFlightWorkUnits,
  enumerateOwnedIntegratingWorkUnits,
  projectWorkUnitPresenceFacts,
  type InFlightWorkUnitFacts,
  type InFlightWorkUnitSweepResult,
  type BehindBaseRelation,
} from "./in-flight-work-unit-sweep.js";
import type { NudgeMarkerState } from "./nudge-rate-limit.js";

/** Live PR disposition facts for one branch, sharpening a presence-tier leaf. */
export type WorkUnitPrFacts = Pick<
  InFlightWorkUnitFacts,
  "merged" | "hasOpenPr" | "approved" | "changesRequested" | "checksFailed"
>;

/**
 * PR-state source for the mergeable-sharpening tier — resolves live PR facts
 * for the given branches, keyed by branch (branches with no resolvable PR are
 * absent from the map). A source that rejects (e.g. `gh` is absent,
 * unauthenticated, or the network is unreachable) degrades the sweep to the
 * presence tier — the composer catches the throw and never propagates it.
 */
export type WorkUnitPrSource = (
  branches: readonly string[],
) => Promise<Map<string, WorkUnitPrFacts>>;

/** Composite work-unit completion-sweep state exposed by the session-init envelope. */
export interface WorkUnitStateResult {
  /** The classified owned in-flight work units across the completion tail. */
  inFlight: InFlightWorkUnitSweepResult;
  /**
   * Once-per-calendar-day marker state for the batched `stale` nudge. The event
   * states (`mergeable` / `merged-needs-archival`) bypass this gate and surface
   * every session-init; only the time-gated `stale` overlay batches against it.
   */
  nudge: NudgeMarkerState;
  /** Soft diagnostics; a degraded read should not block session-init. */
  warnings: string[];
}

export interface RunWorkUnitStateOptions {
  exec: GitExec;
  /** The identity-filtered worktree roster resolved by session-init. */
  roster: readonly WorktreeRosterEntry[];
  /** The operator's identity; `null` passes every roster entry. */
  identity: string | null;
  /** Resolved `branch.base` — the integration base each WU's behind-base fact is read against. */
  baseBranch: string;
  /** Whole-day threshold for classifying an awaiting-review WU as stale. */
  staleThresholdDays: number;
  /** Once-per-day marker state for the batched `stale` nudge, threaded onto the result. */
  nudge: NudgeMarkerState;
  /**
   * Optional live-PR source for the mergeable-sharpening tier. When provided
   * (the handoff / no-active-WU network slice), the presence-tier leaves are
   * sharpened from live PR state; when omitted, the sweep stays presence-only.
   */
  prSource?: WorkUnitPrSource;
  /** ISO-8601 reference time for deterministic age calculation. */
  now?: string;
}

/** Supplied prerequisites for behind-base analysis against one advertised base commit. */
export interface AnalyzeBehindBaseSnapshotOptions {
  exec: GitExec;
  branches: readonly string[];
  baseBranch: string;
  remoteSyncEnabled: boolean;
  snapshot: RemoteHeadSnapshotResult;
  objectAvailability: ObjectAvailabilityResult;
  history: HistoryCompletenessResult;
}

/**
 * Analyze each local branch against immutable advertised base evidence.
 *
 * @param options - Branches, advertised evidence, local prerequisites, and Git executor.
 * @returns One evidence-qualified behind-base relation per requested branch.
 */
export async function analyzeBehindBaseSnapshot(
  options: AnalyzeBehindBaseSnapshotOptions,
): Promise<Map<string, BehindBaseRelation>> {
  if (!options.remoteSyncEnabled) {
    return relationsFor(options.branches, {
      status: "not-applicable",
      remoteEvidence: "not-applicable",
    });
  }
  if (options.snapshot.kind === "unreachable") {
    return relationsFor(options.branches, {
      status: "unavailable",
      remoteEvidence: "unreachable",
      failureReason: options.snapshot.failureReason,
    });
  }
  const baseOid = options.snapshot.tips[options.baseBranch];
  if (baseOid === undefined) {
    return relationsFor(options.branches, {
      status: "unavailable",
      remoteEvidence: "exact",
      reason: "remote-base-absent",
    });
  }
  if (options.objectAvailability.kind !== "complete") {
    throw new Error("Advertised base commit availability could not be inspected.");
  }
  const baseCommitIsLocal = options.objectAvailability.commits[baseOid];
  if (baseCommitIsLocal === false) {
    return relationsFor(options.branches, {
      status: "unavailable",
      remoteEvidence: "pending-fetch",
      reason: "base-object-pending-fetch",
    });
  }
  if (baseCommitIsLocal === undefined) {
    throw new Error("The advertised base commit has no local availability fact.");
  }
  if (options.history.kind !== "complete") {
    throw new Error("Complete local history is required for behind-base analysis.");
  }
  const localOnlyExec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    objectAccess: "local-only",
  });
  const relations = new Map<string, BehindBaseRelation>();
  await Promise.all(options.branches.map(async (branch) => {
    const { behind } = await countAheadBehindRef(localOnlyExec, branch, baseOid);
    relations.set(branch, { status: "known", value: behind > 0, remoteEvidence: "exact" });
  }));
  return relations;
}

function relationsFor(
  branches: readonly string[],
  relation: BehindBaseRelation,
): Map<string, BehindBaseRelation> {
  return new Map(branches.map((branch) => [branch, relation]));
}

/**
 * Compose the session-init work-unit completion-sweep state — presence tier.
 *
 * Reads branch-tip committer dates, enumerates the operator's owned
 * `Integrating` work units from the roster, projects them onto the classifier's
 * fact shape using tracked state alone, overlays a network-free behind-base read
 * against the local `origin/<base>` ref, and classifies the completion tail. No
 * network in the presence path: every WU classifies as `awaiting-review` (or
 * `stale` past the threshold) until a PR source sharpens it.
 *
 * @param options - Git adapter, roster, identity, base branch, staleness threshold, nudge, and reference time.
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
  const warnings = [...committerDates.warnings];

  const sharpened = await sharpenFromPrState(facts, options.prSource, warnings);
  const withBase = await overlayBehindBase(sharpened, options.exec, options.baseBranch, warnings);
  const inFlight = classifyInFlightWorkUnits({
    workUnits: withBase,
    staleThresholdDays: options.staleThresholdDays,
  });

  return { inFlight, nudge: options.nudge, warnings };
}

/**
 * Overlay each WU's behind-base fact — the integration base carries commits the
 * branch lacks, so a merge needs the base folded in first. Reuses the shared
 * ahead/behind distance primitive against the *local* `origin/<base>` tracking
 * ref (no fetch), keeping this an always-on, network-free read. A missing base
 * ref. Unexpected local graph failures propagate to the runtime probe boundary
 * instead of publishing an ordinary known-false relation.
 */
async function overlayBehindBase(
  facts: readonly InFlightWorkUnitFacts[],
  exec: GitExec,
  baseBranch: string,
  warnings: string[],
): Promise<InFlightWorkUnitFacts[]> {
  if (facts.length === 0) return [...facts];

  const baseRef = `origin/${baseBranch}`;
  if (!await refExists(exec, baseRef)) {
    warnings.push("Behind-base read degraded (local base ref unavailable).");
    return facts.map((fact) => ({
      ...fact,
      behindBase: { status: "not-applicable", remoteEvidence: "not-applicable" },
    }));
  }
  return Promise.all(
    facts.map(async (f) => {
      const { behind } = await countAheadBehindRef(exec, f.branch, baseRef);
      return {
        ...f,
        behindBase: { status: "known", value: behind > 0, remoteEvidence: "exact" } as const,
      };
    }),
  );
}

async function refExists(exec: GitExec, ref: string): Promise<boolean> {
  const args = ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`];
  try {
    await exec("git", args);
    return true;
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args });
    if (normalized.kind === "nonzero-exit" && normalized.exitCode === 1) return false;
    throw error;
  }
}

/**
 * Sharpen the presence-tier facts from live PR state — the mergeable-sharpening
 * tier. Queries the PR source for the enumerated branches and overlays each
 * resolved PR's disposition onto its presence fact; branches with no resolvable
 * PR keep their presence facts. A source that rejects degrades to presence —
 * the original facts are returned and a soft warning is appended.
 */
async function sharpenFromPrState(
  facts: readonly InFlightWorkUnitFacts[],
  prSource: WorkUnitPrSource | undefined,
  warnings: string[],
): Promise<InFlightWorkUnitFacts[]> {
  if (prSource === undefined || facts.length === 0) return [...facts];
  try {
    const prFacts = await prSource(facts.map((f) => f.branch));
    return facts.map((f) => {
      const pr = prFacts.get(f.branch);
      return pr === undefined ? f : { ...f, ...pr };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Mergeable-sharpening tier degraded to presence (PR source unavailable): ${message}`);
    return [...facts];
  }
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
