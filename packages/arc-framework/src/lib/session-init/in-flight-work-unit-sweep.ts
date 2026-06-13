/**
 * In-flight-work-unit sweep — a session-init advisory over the developer's
 * owned work units across the completion tail, the WU-side analog of the
 * in-flight-errand sweep.
 *
 * A work unit in `Integrating` sits in the awaiting-review window. Its tail is
 * `awaiting-review → mergeable → merged-needs-archival`, with a `blocked` branch
 * (changes requested or checks failed) and a `stale` time-gated overlay on
 * `awaiting-review`. The errand 4-state enum does not map onto this tail, so the
 * WU classifier carries its own enum and its own caller-resolved fact shape
 * rather than extending the errand path.
 *
 * Pure core: the caller enumerates the owned WUs and resolves each one's PR /
 * merge / age / archival facts (roster + git + the forge), so this module
 * carries no git or network coupling. The merged and PR-disposition states are
 * event-driven and bypass the age threshold; only `awaiting-review` takes the
 * `stale` overlay. An archived WU (meta swept to `completed/`) is terminal and
 * excluded from the surface, mirroring the errand sweep's meta-backed exclusion.
 *
 * @module
 */

import type { WorktreeRosterEntry } from "../git/worktree-roster.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Derived completion-tail state of a single in-flight work unit. */
export type InFlightWorkUnitState =
  | "awaiting-review"
  | "mergeable"
  | "blocked"
  | "merged-needs-archival"
  | "stale";

/** Caller-resolved facts for one owned work unit in the completion tail. */
export interface InFlightWorkUnitFacts {
  /** The work unit's name (derived from its meta filename by the caller). */
  name: string;
  /** The work unit's branch name. */
  branch: string;
  /** Whether the meta has been swept to `completed/` — terminal, excluded from the surface. */
  archived: boolean;
  /** Whether the PR is merged into the integration base. */
  merged: boolean;
  /** Whether the branch has an open PR on the forge. */
  hasOpenPr: boolean;
  /** Whether an open PR is approved with passing checks — the mergeable signal. */
  approved: boolean;
  /** Whether an open PR has changes requested. */
  changesRequested: boolean;
  /** Whether an open PR has failing checks. */
  checksFailed: boolean;
  /**
   * Whether the branch is behind its integration base — the base carries
   * commits the branch lacks, so a merge needs the base folded in first. An
   * advisory qualifier on the surfaced state (notably `mergeable`), never a
   * state of its own.
   */
  behindBase: boolean;
  /** Whole-day age of the branch's latest commit — the staleness anchor. */
  ageDays: number;
}

/** One classified in-flight work unit. */
export interface InFlightWorkUnitReport {
  /** The work unit's name. */
  name: string;
  /** The work unit's branch name. */
  branch: string;
  /** Derived completion-tail state. */
  state: InFlightWorkUnitState;
  /**
   * Whether the branch is behind its integration base — an advisory qualifier
   * the orientation surfaces alongside the state (e.g. "mergeable, but behind
   * base"). Orthogonal to the state; never gates or auto-acts.
   */
  behindBase: boolean;
  /** Whole-day age of the branch's latest commit. */
  ageDays: number;
}

export interface ClassifyInFlightWorkUnitsOptions {
  /** Caller-enumerated owned work units with their resolved facts. */
  workUnits: readonly InFlightWorkUnitFacts[];
  /** Age threshold in whole days; an awaiting-review WU strictly older is stale. */
  staleThresholdDays: number;
}

export interface InFlightWorkUnitSweepResult {
  /** The classified in-flight work units (excludes archived, terminal WUs). */
  workUnits: InFlightWorkUnitReport[];
}

/**
 * Classify caller-enumerated owned work units into completion-tail states.
 *
 * Archived WUs (meta swept to `completed/`) are excluded as terminal. State
 * precedence: merged → `merged-needs-archival`; else an open PR with a failing
 * disposition → `blocked`; else an approved-and-green open PR → `mergeable`;
 * else `awaiting-review`, overlaid with `stale` when aged past the threshold.
 * The merged and PR-disposition states are event-driven and bypass the age
 * threshold.
 *
 * @param options - Owned work units with facts, and the staleness threshold.
 * @returns The classified in-flight work units.
 */
export function classifyInFlightWorkUnits(
  options: ClassifyInFlightWorkUnitsOptions,
): InFlightWorkUnitSweepResult {
  const { workUnits, staleThresholdDays } = options;

  const reports: InFlightWorkUnitReport[] = [];
  for (const wu of workUnits) {
    if (wu.archived) continue;

    const state: InFlightWorkUnitState = wu.merged
      ? "merged-needs-archival"
      : wu.hasOpenPr && (wu.changesRequested || wu.checksFailed)
        ? "blocked"
        : wu.hasOpenPr && wu.approved
          ? "mergeable"
          : wu.ageDays > staleThresholdDays
            ? "stale"
            : "awaiting-review";

    reports.push({
      name: wu.name,
      branch: wu.branch,
      state,
      behindBase: wu.behindBase,
      ageDays: wu.ageDays,
    });
  }
  return { workUnits: reports };
}

/** One owned, in-flight work unit enumerated from tracked roster state. */
export interface OwnedIntegratingWorkUnit {
  /** The work unit's name, derived from its meta filename. */
  name: string;
  /** The work unit's branch name. */
  branch: string;
  /** Committer-date (unix seconds) of the branch tip — the staleness anchor; `null` when unresolved. */
  committerDate: number | null;
}

export interface EnumerateOwnedIntegratingWorkUnitsOptions {
  /** The session-init worktree roster. */
  roster: readonly WorktreeRosterEntry[];
  /** The operator's identity; `null` passes every entry (nothing to filter against). */
  identity: string | null;
  /** Branch → committer-date (unix seconds), resolved once by the caller from tracked refs. */
  committerDates: ReadonlyMap<string, number>;
}

/**
 * Enumerate the operator's in-flight work units from the roster — the WU-side
 * analog of the errand path's `chore/` branch scan, sourced from tracked state
 * so it costs no network.
 *
 * Keeps entries in `State: Integrating` that resolve a meta file and are owned
 * by the operator (or unattributed — solo-owned); a `null` identity passes
 * every entry. Each candidate carries its branch-tip committer date from the
 * caller-resolved map as the staleness anchor.
 *
 * @param options - The roster, the operator's identity, and the committer-date map.
 * @returns The owned, in-flight work units.
 */
export function enumerateOwnedIntegratingWorkUnits(
  options: EnumerateOwnedIntegratingWorkUnitsOptions,
): OwnedIntegratingWorkUnit[] {
  const { roster, identity, committerDates } = options;

  const workUnits: OwnedIntegratingWorkUnit[] = [];
  for (const entry of roster) {
    if (entry.state !== "Integrating") continue;
    if (entry.metaFilePath === undefined) continue;
    if (identity !== null && entry.identity !== undefined && entry.identity !== identity) continue;

    workUnits.push({
      name: workUnitNameFromMetaPath(entry.metaFilePath),
      branch: entry.branch,
      committerDate: committerDates.get(entry.branch) ?? null,
    });
  }
  return workUnits;
}

export interface ProjectWorkUnitPresenceFactsOptions {
  /** The enumerated owned, in-flight work units. */
  workUnits: readonly OwnedIntegratingWorkUnit[];
  /** ISO-8601 reference time for deterministic age calculation. */
  now: string;
}

/**
 * Project each enumerated work unit onto the classifier's fact shape using
 * tracked state alone — no network.
 *
 * A roster-sourced WU has its meta in `active/`, so it is never `archived`; the
 * live-PR facts (`merged`, `hasOpenPr`, `approved`, `changesRequested`,
 * `checksFailed`) are left `false` for the mergeable-sharpening tier to upgrade,
 * and `behindBase` `false` for the composer's network-free base read to overlay.
 * The committer-date anchor becomes a whole-day age against `now`. The presence
 * tier therefore classifies every WU as `awaiting-review` (or `stale` when aged
 * past the threshold) until a PR source sharpens it.
 *
 * @param options - The enumerated work units and the reference time.
 * @returns The presence-tier facts ready for `classifyInFlightWorkUnits`.
 */
export function projectWorkUnitPresenceFacts(
  options: ProjectWorkUnitPresenceFactsOptions,
): InFlightWorkUnitFacts[] {
  const nowMs = Date.parse(options.now);
  return options.workUnits.map((wu) => ({
    name: wu.name,
    branch: wu.branch,
    archived: false,
    merged: false,
    hasOpenPr: false,
    approved: false,
    changesRequested: false,
    checksFailed: false,
    behindBase: false,
    ageDays: ageDays(wu.committerDate, nowMs),
  }));
}

/** Derive a work unit's name from its meta filename (`meta-<name>.md` → `<name>`). */
function workUnitNameFromMetaPath(metaFilePath: string): string {
  const base = metaFilePath.split("/").pop() ?? metaFilePath;
  return base.replace(/^meta-/u, "").replace(/\.md$/u, "");
}

/** Whole-day age of a unix-seconds timestamp against `nowMs`; 0 when unresolved. */
function ageDays(timestamp: number | null, nowMs: number): number {
  if (timestamp === null || Number.isNaN(nowMs)) return 0;
  return Math.max(0, Math.floor((nowMs - timestamp * 1000) / MS_PER_DAY));
}
