/** Shared liveness and bounded lane-owner retry mechanics for local preparation. */

import type { LocalReviewState } from "../core/operation-state-schema.js";
import {
  isReviewVersionConflict,
  REVIEW_VERSION_RETRY_ATTEMPTS,
} from "../core/version-conflict.js";

export function cleanupExpired(state: LocalReviewState, nowInput: string): boolean {
  const admittedAt = Date.parse(state.updatedAt);
  const now = Date.parse(nowInput);
  if (!Number.isFinite(admittedAt) || !Number.isFinite(now)) {
    throw new Error("invalid local review cleanup clock");
  }
  return now >= admittedAt + state.cleanupTtlMs;
}

export async function retryLaneOwnerConflicts<T>(
  action: (attempt: number) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < REVIEW_VERSION_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await action(attempt);
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
  }
  throw new Error(
    "local review preparation exceeded version-conflict retry attempts; "
    + "retry the same prepare request after concurrent review writes quiesce",
  );
}
