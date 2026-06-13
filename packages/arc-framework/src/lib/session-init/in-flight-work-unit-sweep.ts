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

    reports.push({ name: wu.name, branch: wu.branch, state, ageDays: wu.ageDays });
  }
  return { workUnits: reports };
}
