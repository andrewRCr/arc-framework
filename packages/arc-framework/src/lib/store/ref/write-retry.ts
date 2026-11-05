/** Retain factual history-destination observations across write attempts. */

import type { StoreRefusal } from "../refusal.js";
import { historyDestinationFailure } from "./write-history.js";

/** A rebuild's expected destinations and the values that defeated publication. */
export interface RefWriteRetry {
  status: "retry";
  destinations: ReadonlyMap<string, string | null>;
  observed: ReadonlyMap<string, string | null>;
}

/** One public write owns the history-loss streak, even when it resolves its owners again. */
export interface RefHistoryRetryState {
  observed: Map<string, string | null>;
  consecutive: number;
  resolution: "initial" | "basis" | "uncompared";
}

/** A resolution's capture is compared once, even when several locked attempts use it. */
export interface RefHistoryResolution {
  tips: ReadonlyMap<string, string>;
  pending?: RefHistoryRetryState["resolution"];
}

/** Several observations in one locked attempt may reveal moves but consume at most one loss. */
export interface RefHistoryAttempt { resolution: RefHistoryResolution; counted: boolean }

/** Observe the prepared attempt's destination capture before it can publish successfully. */
export function observeRefHistoryRead(state: RefHistoryRetryState, destinations: ReadonlyMap<string, string | null>,
  attempt: RefHistoryAttempt): StoreRefusal | undefined {
  let moved = observeHistoryResolution(state, destinations, attempt.resolution);
  const readMove = observeHistoryValues(state, destinations);
  moved ??= readMove;
  return countRefHistoryMove(state, attempt, moved);
}

/** Count each new move once per attempt; a proven re-detection neither counts nor resets. */
export function recordRefHistoryRetry(state: RefHistoryRetryState, retry: RefWriteRetry,
  attempt: RefHistoryAttempt, basisChanges?: readonly string[]): StoreRefusal | undefined {
  const redetected = basisChanges !== undefined && basisChanges.length > 0 && basisChanges.every(ref =>
    retry.destinations.has(ref) && state.observed.has(ref) && state.observed.get(ref) === retry.observed.get(ref)
    && retry.destinations.get(ref) !== retry.observed.get(ref));
  let moved = observeHistoryResolution(state, retry.destinations, attempt.resolution);
  const expectedMove = observeHistoryValues(state, retry.destinations, basisChanges !== undefined);
  moved ??= expectedMove;
  const observedMove = observeHistoryValues(state, new Map([...retry.observed].filter(([ref]) => retry.destinations.has(ref))));
  moved ??= observedMove;
  const refusal = countRefHistoryMove(state, attempt, moved);
  if (!attempt.counted && !redetected) state.consecutive = 0;
  return refusal;
}

function countRefHistoryMove(state: RefHistoryRetryState, attempt: RefHistoryAttempt, moved: string | undefined): StoreRefusal | undefined {
  if (moved && !attempt.counted) { state.consecutive += 1; attempt.counted = true; }
  return moved && state.consecutive >= 3 ? historyDestinationFailure(moved,
    `The write lost a history destination on three consecutive attempts; ${moved} changed on the last attempt. The record transaction was not published.`) : undefined;
}

function observeHistoryResolution(state: RefHistoryRetryState, destinations: ReadonlyMap<string, string | null>,
  resolution: RefHistoryResolution): string | undefined {
  if (resolution.pending === undefined) return undefined;
  const moved = observeHistoryValues(state, new Map([...destinations.keys()].map(ref => [ref, resolution.tips.get(ref) ?? null])));
  if (resolution.pending === "uncompared" && !moved) state.consecutive = 0;
  resolution.pending = undefined;
  return moved;
}

function observeHistoryValues(state: RefHistoryRetryState, values: ReadonlyMap<string, string | null>, seedOnly = false): string | undefined {
  let moved: string | undefined;
  for (const [ref, value] of values) {
    if (state.observed.has(ref)) {
      if (seedOnly) continue;
      if (state.observed.get(ref) !== value) moved ??= ref;
    }
    state.observed.set(ref, value);
  }
  return moved;
}
