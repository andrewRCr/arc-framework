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
import { countAheadBehindRef } from "../git/worktree-sync.js";
import type { WorktreeRosterEntry } from "../git/worktree-roster.js";

import {
  classifyInFlightWorkUnits,
  enumerateOwnedIntegratingWorkUnits,
  projectWorkUnitPresenceFacts,
  type InFlightWorkUnitFacts,
  type InFlightWorkUnitSweepResult,
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
 * ref or a per-branch read failure resolves to `behindBase: false` (advisory
 * fail-safe) rather than blocking the sweep; the first failure adds one soft
 * warning.
 */
async function overlayBehindBase(
  facts: readonly InFlightWorkUnitFacts[],
  exec: GitExec,
  baseBranch: string,
  warnings: string[],
): Promise<InFlightWorkUnitFacts[]> {
  if (facts.length === 0) return [...facts];

  const baseRef = `origin/${baseBranch}`;
  let warned = false;
  return Promise.all(
    facts.map(async (f) => {
      try {
        const { behind } = await countAheadBehindRef(exec, f.branch, baseRef);
        return { ...f, behindBase: behind > 0 };
      } catch (err) {
        if (!warned) {
          warned = true;
          const message = err instanceof Error ? err.message : String(err);
          warnings.push(`Behind-base read degraded (base ref unresolved): ${message}`);
        }
        return { ...f, behindBase: false };
      }
    }),
  );
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
