/**
 * Errand-staleness sweep — a session-init advisory that flags errands pending
 * past a threshold so the operator can execute or demote them.
 *
 * Advisory only: it never mutates state. The pure core ages a set of dated
 * candidate entries against a whole-day threshold; the candidates and the
 * threshold are resolved by the caller (the session-init probe), so this module
 * carries no file or source coupling of its own.
 *
 * A sibling of the stale-worktree sweep in *role* (a session-init advisory
 * riding the status envelope), not in *mechanics*: it ages capture dates with
 * no git signals and no worktree gating.
 *
 * @module
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A candidate entry to age: a stable key and its `YYYY-MM-DD` capture date. */
export interface DatedErrandEntry {
  /** The entry's identifying key — surfaced as the report slug. */
  key: string;
  /** The entry's capture date (`YYYY-MM-DD`) — the age source. */
  created: string;
}

/** One stale entry surfaced for execute-or-demote. */
export interface StaleErrandReport {
  /** The entry's key — its `chore/<slug>` branch name. */
  slug: string;
  /** The entry's capture date (`YYYY-MM-DD`). */
  created: string;
  /** Whole-day age of the entry at sweep time. */
  ageDays: number;
}

export interface ErrandStalenessSweepResult {
  /** Entries pending past the threshold — surfaced to execute or demote. */
  stale: StaleErrandReport[];
}

export interface RunErrandStalenessSweepOptions {
  /** Candidate entries to age; empty when no source is in scope. */
  entries: readonly DatedErrandEntry[];
  /** Age threshold in whole days; entries strictly older than this are flagged. */
  thresholdDays: number;
  /** ISO-8601 reference time for age computation; defaults to now. */
  now?: string;
}

/**
 * Flag candidate entries older than the threshold.
 *
 * Entries with no parseable `created` date can't be aged and are skipped
 * (never flagged).
 *
 * @param options - Candidate entries, age threshold, and the reference time.
 * @returns The stale entries (possibly empty), each with its whole-day age.
 */
export function runErrandStalenessSweep(
  options: RunErrandStalenessSweepOptions,
): ErrandStalenessSweepResult {
  const { entries, thresholdDays } = options;
  const nowMs = Date.parse(options.now ?? new Date().toISOString());

  const stale: StaleErrandReport[] = [];
  for (const { key, created } of entries) {
    const createdMs = Date.parse(`${created}T00:00:00.000Z`);
    if (Number.isNaN(createdMs)) continue;
    const ageDays = Math.floor((nowMs - createdMs) / MS_PER_DAY);
    if (ageDays > thresholdDays) {
      stale.push({ slug: key, created, ageDays });
    }
  }
  return { stale };
}
