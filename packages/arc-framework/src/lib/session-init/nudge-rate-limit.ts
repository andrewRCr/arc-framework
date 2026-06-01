/**
 * Reminder-nudge rate limit — gate the batched reminder advisory to once per
 * calendar day.
 *
 * The reminder nudge is a single batched orientation line, not a per-entry
 * alert, and it should recur at most once a day until a housekeep drain clears
 * the flagged captures. A per-user gitignored last-nudge marker records the day
 * the batch last surfaced; this pure gate compares its calendar day to today.
 *
 * Once/day is a framework constant, not user config — only the reminder
 * threshold (`inbox.remind_after_days`) is config-exposed.
 *
 * @module
 */

/** A `YYYY-MM-DD` calendar day, or `null` when no day could be read. */
const calendarDay = (value: string): string | null => {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
};

export interface ShouldNudgeOptions {
  /** The last-nudge marker's value (`YYYY-MM-DD` or an ISO timestamp), or `null` when never nudged. */
  lastNudge: string | null;
  /** Today's calendar day (`YYYY-MM-DD`). */
  today: string;
}

/**
 * Decide whether the reminder nudge may surface today.
 *
 * Returns `true` when no marker exists, when the marker's calendar day is
 * earlier than today, or when the marker is unparseable (fail-open — a corrupt
 * marker never silently suppresses the nudge). Returns `false` when the marker
 * is today or dated ahead of today (clock skew).
 *
 * @param options - The last-nudge marker and today's calendar day.
 * @returns Whether the nudge may surface today.
 */
export function shouldNudge(options: ShouldNudgeOptions): boolean {
  const { lastNudge, today } = options;
  if (lastNudge === null) return true;

  const last = calendarDay(lastNudge);
  if (last === null) return true;

  return last < today;
}
