/**
 * Auto-retry for the notes-leg push.
 *
 * The notes leg of a paired push can fail on a transient blip (a network
 * hiccup, a momentarily-unreachable remote). Re-pushing the same ref carries
 * *zero clobber risk* — the ref only advances — so a couple of quick silent
 * retries resolve most blips before they ever reach a surface. When retries are
 * exhausted (or the failure is non-transient to begin with), this primitive
 * returns a structured retry-offer for the caller to resolve.
 *
 * Non-interactive by construction: it never prompts and never blocks on a TTY.
 * The retry *decision* — surface conversationally, persist the marker, or
 * re-attempt — is owned by the agent/workflow layer, which reads the returned
 * offer. The CLI primitive only auto-retries and reports.
 *
 * @module
 */

import type { PairedPushNotesPusherResult } from "./types.js";

/** Tuning for the silent auto-retry loop that precedes the primed-retry offer. */
export interface NotesPushRetryConfig {
  /** Maximum silent auto-retries before surfacing the offer. */
  maxAutoRetries: number;
  /**
   * Backoff before each auto-retry, in milliseconds. The delay for retry `i`
   * is `backoffMs[i]`, falling back to the last entry once the array is
   * exhausted (so a shorter array than `maxAutoRetries` reuses its tail delay).
   */
  backoffMs: readonly number[];
}

/**
 * Default schedule: two silent retries at ~250ms then ~750ms. Long enough to
 * clear a transient blip, short enough that the success path's added latency is
 * unnoticeable; bounded so a persistent failure surfaces promptly rather than
 * spinning.
 */
export const DEFAULT_NOTES_PUSH_RETRY: NotesPushRetryConfig = {
  maxAutoRetries: 2,
  backoffMs: [250, 750],
};

/**
 * Outcome of {@link runNotesPushWithRetry}.
 *
 * - `resolved`: the notes push succeeded (possibly after one or more silent
 *   auto-retries). No marker persists; B sees nothing.
 * - `retry-offer`: the push is still failing. The caller surfaces a primed
 *   retry (defaulted to retry) and, on deferral, persists the marker knowingly.
 *
 * Both variants carry the final attempt's `result` and the number of
 * `autoRetries` consumed (forensic: distinguishes "first-try success" from
 * "recovered after N retries").
 */
export type NotesPushRetryResult =
  | { kind: "resolved"; result: PairedPushNotesPusherResult; autoRetries: number }
  | { kind: "retry-offer"; result: PairedPushNotesPusherResult; autoRetries: number };

/**
 * The primed-retry offer surfaced when the notes leg is still failing after
 * auto-retry. Carried on the paired-push result for the agent/workflow layer to
 * resolve; the failure detail itself lives in the result's `notes` outcome.
 */
export interface NotesPushRetryOffer {
  /** Silent auto-retries consumed before the offer surfaced (0 for a terminal failure). */
  autoRetries: number;
}

/** Default delay primitive — a real timer; injectable so tests don't wait. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the notes-leg push under bounded auto-retry.
 *
 * Calls `attempt`, and while it returns a *transient* failure (a raw `failed`
 * status — a git/network error a re-push can clear) retries up to
 * `config.maxAutoRetries` times with backoff. A success (`success` / `noop` /
 * `ok-recovered`) resolves; any non-success that is either non-transient or
 * still failing after the budget is exhausted yields a `retry-offer`. Never
 * throws and never prompts.
 *
 * @param attempt - Fires one notes-push attempt, returning its outcome.
 * @param config - Retry budget and backoff schedule. Defaults to
 *   {@link DEFAULT_NOTES_PUSH_RETRY}.
 * @param sleep - Delay primitive, injectable for tests. Defaults to a real timer.
 * @returns The resolved outcome or a structured retry-offer.
 */
export async function runNotesPushWithRetry(
  attempt: () => Promise<PairedPushNotesPusherResult>,
  config: NotesPushRetryConfig = DEFAULT_NOTES_PUSH_RETRY,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<NotesPushRetryResult> {
  let autoRetries = 0;
  let result = await attemptOnce(attempt);

  while (isTransientFailure(result) && autoRetries < config.maxAutoRetries) {
    await sleep(backoffFor(config.backoffMs, autoRetries));
    autoRetries += 1;
    result = await attemptOnce(attempt);
  }

  return isNotesSuccess(result)
    ? { kind: "resolved", result, autoRetries }
    : { kind: "retry-offer", result, autoRetries };
}

/**
 * Run one attempt, honoring this primitive's "never throws" contract: a
 * delegate that *rejects* (rather than returning a `failed` result) is
 * normalized to one. Without this, a rejected attempt would propagate out of
 * the paired push after the worktree leg already landed, skipping the
 * marker-clear / marker-record cleanup and the retry-offer surface. A rejection
 * is a git/network error a re-push can clear, so the normalized `failed` keeps
 * it on the transient-retry path.
 */
async function attemptOnce(
  attempt: () => Promise<PairedPushNotesPusherResult>,
): Promise<PairedPushNotesPusherResult> {
  try {
    return await attempt();
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/** A push outcome that completed the leg — nothing to recover. */
function isNotesSuccess(result: PairedPushNotesPusherResult): boolean {
  return (
    result.status === "success"
    || result.status === "noop"
    || result.status === "ok-recovered"
  );
}

/**
 * A failure a re-push can clear. Only a raw `failed` (a git/network error)
 * qualifies — `no-remote`, `blocked`, and `failed-nontty-conflict` are
 * non-transient (retrying the same push without resolving them just fails
 * again), so they skip auto-retry and surface the offer immediately.
 */
function isTransientFailure(result: PairedPushNotesPusherResult): boolean {
  return result.status === "failed";
}

/** Backoff for retry `i`, reusing the tail delay once the array is exhausted. */
function backoffFor(backoffMs: readonly number[], i: number): number {
  const tail = backoffMs[backoffMs.length - 1];
  if (tail === undefined) return 0; // empty schedule → no wait
  return backoffMs[i] ?? tail;
}
