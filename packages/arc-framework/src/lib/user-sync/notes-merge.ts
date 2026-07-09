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

import { uniqueRefToken } from "../git/ref-tree.js";

/** True when a push error message signals a non-fast-forward / rejected divergence. */
export function isNonFastForwardError(message: string): boolean {
  return message.includes("non-fast-forward") || message.includes("[rejected]");
}

/** True when a push/fetch error signals the remote is unreachable or unconfigured. */
export function isRemoteUnavailableError(message: string): boolean {
  return message.includes("Could not read from remote") || message.includes("No such remote");
}

/**
 * True when an `update-ref` failure is a compare-and-swap rejection — the ref's
 * old value did not match what the caller expected. Git emits one of two shapes:
 * `is at <sha> but expected <sha>` when the ref moved under the writer, and
 * `reference already exists` when a create-from-absent (empty old value) lost to
 * a concurrent create. Only these retry under the same-machine CAS frame; every
 * other git error surfaces. Sibling to {@link isNonFastForwardError} (the
 * cross-machine push twin) and {@link isRemoteUnavailableError}.
 */
export function isCasRejectionError(message: string): boolean {
  return message.includes("but expected") || message.includes("reference already exists");
}

/** Temp tracking ref a remote notes ref is fetched into before merging. */
export function incomingNotesRef(fullNotesRef: string, token: string = uniqueRefToken()): string {
  return `${fullNotesRef}__incoming_${token}`;
}

/** Force-fetch refspec pulling a remote notes ref into its temp tracking ref. */
export function incomingFetchRefspec(
  fullNotesRef: string,
  incomingRef: string = incomingNotesRef(fullNotesRef),
): string {
  return `+${fullNotesRef}:${incomingRef}`;
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

/**
 * Whether a merged note still parses as exactly one sync manifest.
 *
 * `cat_sort_uniq` line-merges note blobs and exits 0 even when two worktrees
 * annotated the same commit — their single-line JSON manifests concatenate into
 * `{…}\n{…}`, which is not valid JSON. The reconcile keys "non-trivial conflict"
 * off this post-merge check, not git's (clean) exit signal. Parser-shaped (no
 * throw) so a later zod swap on the read boundary is mechanical.
 */
export function isResolvedNoteValid(content: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null) return false;
  const raw = parsed as Record<string, unknown>;
  return (
    (raw.version === 1 || raw.version === 2)
    && typeof raw.files === "object"
    && raw.files !== null
  );
}
