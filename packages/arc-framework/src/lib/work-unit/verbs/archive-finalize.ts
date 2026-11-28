/** The facts an archive records in the archived meta's `PR URL` and `Completed` fields, whichever arm writes them. */
import type { Clock } from "../completed-index.js";

/** The value an archive without a pull request URL writes. */
export const PR_URL_PLACEHOLDER = "[none]";

/** The facts written to an archive's metadata. */
export interface ArchiveFinalizeFacts {
  /** The pull request URL, or null where none was supplied and the placeholder is written. */
  prUrl: string | null;
  /** The completion date, `YYYY-MM-DD`. */
  completed: string;
}

/** Resolve the finalize facts. The date defaults to the clock's day, since an archive runs before its merge.
 * @param params - The archive's `--pr-url` and `--completed`.
 * @param clock - The archive's clock.
 */
export function resolveArchiveFinalizeFacts(params: { prUrl?: string; completed?: string }, clock: Clock): ArchiveFinalizeFacts {
  return {
    prUrl: params.prUrl ?? null,
    completed: params.completed ?? today(clock),
  };
}

/** Explain how to fill the archived metadata's PR URL and persist the edit once the pull request exists. */
export function archivePrUrlWarnings(prUrl: string | null, saveEdit: string): string[] {
  return prUrl === null
    ? [`The archived meta has no PR URL. Once the PR exists, set \`PR URL\` in the archived meta, then ${saveEdit}.`]
    : [];
}

/** The clock's day as a `YYYY-MM-DD` stamp, in local components (matching the quarter label). */
function today(clock: Clock): string {
  const d = clock();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
