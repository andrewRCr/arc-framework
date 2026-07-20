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

import { z } from "zod";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseCreatedDayAtUtcMidnight = (created: string): number | null => {
  const parsed = Date.parse(`${created}T00:00:00.000Z`);
  return Number.isNaN(parsed) ? null : parsed;
};

/** A candidate entry to age: a stable key and its `YYYY-MM-DD` capture date. */
export interface DatedErrandEntry {
  /** The entry's identifying key — surfaced as the report slug. */
  key: string;
  /** The entry's capture date (`YYYY-MM-DD`) — the age source. */
  created: string;
}

/** Runtime authority for one stale entry surfaced for execute-or-demote. */
export const StaleErrandReportSchema = z
  .object({
    slug: z.string().refine((value) => value.trim().length > 0, "entry title must not be empty"),
    created: z.string().refine(
      (value) => parseCreatedDayAtUtcMidnight(value) !== null,
      "created must be parseable as a UTC-midnight day",
    ),
    ageDays: z.number().int().nonnegative(),
  })
  .strict();

/** One stale inbox entry surfaced for execute-or-demote. */
export type StaleErrandReport = z.infer<typeof StaleErrandReportSchema>;

/** Runtime authority for the stale-errand advisory result. */
export const ErrandStalenessSweepResultSchema = z
  .object({ stale: z.array(StaleErrandReportSchema) })
  .strict();

/** Entries pending past the threshold. */
export type ErrandStalenessSweepResult = z.infer<typeof ErrandStalenessSweepResultSchema>;

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
    const createdMs = parseCreatedDayAtUtcMidnight(created);
    if (createdMs === null) continue;
    const ageDays = Math.floor((nowMs - createdMs) / MS_PER_DAY);
    if (ageDays > thresholdDays) {
      stale.push({ slug: key, created, ageDays });
    }
  }
  return { stale };
}
