/**
 * Errand-staleness sweep — flags errand-queue entries pending past a threshold.
 *
 * The errand queue (`ERRANDS.md`) holds committed-but-not-yet-executed errands.
 * An entry pending beyond a short threshold is a miscategorization signal — it
 * wasn't actually committed-near-term — so the sweep surfaces it for the
 * operator to execute or demote to the inbox. Advisory only: it never mutates
 * the queue.
 *
 * A sibling of the stale-worktree sweep in *role* (a session-init advisory
 * riding the status envelope), not in *mechanics*: it reuses the registered
 * `errands` entry parser and ages each entry's `_Created:_` date, with no git
 * signals and no worktree gating (the queue is per-user and present in every
 * worktree).
 *
 * @module
 */

import { parseCrossWuEntries } from "../user-sync/index.js";

/** The `_Created:_ YYYY-MM-DD` descriptor line within an errand entry — the age source. */
const CREATED_LINE = /^\s*-\s*_Created:_\s*(\d{4}-\d{2}-\d{2})\b/m;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** One stale errand-queue entry surfaced for execute-or-demote. */
export interface StaleErrandReport {
  /** The entry's bold slug — its merge key and `chore/<slug>` branch name. */
  slug: string;
  /** The entry's `_Created:_` date (`YYYY-MM-DD`). */
  created: string;
  /** Whole-day age of the entry at sweep time. */
  ageDays: number;
}

export interface ErrandStalenessSweepResult {
  /** Errand entries pending past the threshold — surfaced to execute or demote. */
  stale: StaleErrandReport[];
}

export interface RunErrandStalenessSweepOptions {
  /** `ERRANDS.md` content; empty string when the file is absent. */
  content: string;
  /** Age threshold in whole days; entries strictly older than this are flagged. */
  thresholdDays: number;
  /** ISO-8601 reference time for age computation; defaults to now. */
  now?: string;
}

/**
 * Flag errand-queue entries older than the threshold.
 *
 * Entries with no parseable `_Created:_` date can't be aged and are skipped
 * (never flagged). Malformed entries are dropped by the parser upstream.
 *
 * @param options - Queue content, age threshold, and the reference time.
 * @returns The stale entries (possibly empty), each with its whole-day age.
 */
export function runErrandStalenessSweep(
  options: RunErrandStalenessSweepOptions,
): ErrandStalenessSweepResult {
  const { content, thresholdDays } = options;
  const nowMs = Date.parse(options.now ?? new Date().toISOString());

  const stale: StaleErrandReport[] = [];
  for (const parse of parseCrossWuEntries(content, "errands")) {
    if (!parse.ok) continue;
    const created = parse.entry.raw.match(CREATED_LINE)?.[1];
    if (created === undefined) continue;
    const createdMs = Date.parse(`${created}T00:00:00.000Z`);
    if (Number.isNaN(createdMs)) continue;
    const ageDays = Math.floor((nowMs - createdMs) / MS_PER_DAY);
    if (ageDays > thresholdDays) {
      stale.push({ slug: parse.entry.key, created, ageDays });
    }
  }
  return { stale };
}
