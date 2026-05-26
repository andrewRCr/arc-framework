/**
 * Pure helpers for the lossless concurrent-notes-push reconcile.
 *
 * When parallel worktrees push the shared user-notes ref, the second push hits
 * a non-fast-forward rejection. Rather than the lossy re-save recovery — which
 * serializes only the pushing worktree's directory and drops the notes another
 * worktree concurrently pushed — the reconcile fetches the remote ref into a
 * temp tracking ref and merges it with `git notes merge -s cat_sort_uniq`, a
 * line-level union that preserves both sides. These helpers build the ref names
 * and git args; the IO orchestration lives in `commands/user/push-fetch.ts`.
 *
 * @module
 */

/** True when a push error message signals a non-fast-forward / rejected divergence. */
export function isNonFastForwardError(message: string): boolean {
  return message.includes("non-fast-forward") || message.includes("[rejected]");
}

/** True when a push/fetch error signals the remote is unreachable or unconfigured. */
export function isRemoteUnavailableError(message: string): boolean {
  return message.includes("Could not read from remote") || message.includes("No such remote");
}

/** Temp tracking ref a remote notes ref is fetched into before merging. */
export function incomingNotesRef(fullNotesRef: string): string {
  return `${fullNotesRef}__incoming`;
}

/** Force-fetch refspec pulling a remote notes ref into its temp tracking ref. */
export function incomingFetchRefspec(fullNotesRef: string): string {
  return `+${fullNotesRef}:${incomingNotesRef(fullNotesRef)}`;
}

/**
 * `git notes` args for a lossless union merge of the fetched temp ref into the
 * local notes ref named by `shortNotesRef`. `cat_sort_uniq` line-merges note
 * blobs so entries authored in parallel worktrees survive rather than
 * clobbering one another.
 */
export function notesMergeArgs(shortNotesRef: string, incomingRef: string): string[] {
  return ["notes", "--ref", shortNotesRef, "merge", "-s", "cat_sort_uniq", incomingRef];
}
