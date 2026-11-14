/** The facts an archive records in the archived meta's `PR URL` and `Completed` fields, whichever arm writes them. */
import type { Clock } from "../completed-index.js";

/** The value an archive without a pull request URL writes. */
export const PR_URL_PLACEHOLDER = "[none]";

/** An archive's resolved finalize facts and the advisory an absent URL raises. */
export interface ArchiveFinalizeFacts {
  /** The pull request URL, or null where none was supplied and the placeholder is written. */
  prUrl: string | null;
  /** The completion date, `YYYY-MM-DD`. */
  completed: string;
  warnings: string[];
}

/** Resolve the finalize facts. An absent URL warns rather than blocking, so an offline, resumed, or pre-PR archive
 * still completes; the date defaults to the clock's day, since an archive runs before its merge.
 * @param params - The archive's `--pr-url` and `--completed`.
 * @param clock - The archive's clock.
 */
export function resolveArchiveFinalizeFacts(params: { prUrl?: string; completed?: string }, clock: Clock): ArchiveFinalizeFacts {
  return {
    prUrl: params.prUrl ?? null,
    completed: params.completed ?? today(clock),
    warnings: params.prUrl === undefined
      ? [`No \`--pr-url\` supplied — wrote a \`${PR_URL_PLACEHOLDER}\` placeholder; set the \`PR URL\` field in the archived `
        + "meta once the PR exists (archive can't retarget a shipped WU)."]
      : [],
  };
}

/** The clock's day as a `YYYY-MM-DD` stamp, in local components (matching the quarter label). */
function today(clock: Clock): string {
  const d = clock();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
