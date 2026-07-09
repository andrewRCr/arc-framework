/**
 * Pure inference helper that classifies the cause of user-notes-ref divergence
 * from precomputed inputs. Performs no IO — call sites supply ref topology and
 * ancestry results derived from `inspectUserSyncRefsDetailed` + `LocalSyncState`.
 *
 * Consumed by `runUserStatus` rendering and the session-init load cascade so
 * both surfaces share a single classification engine.
 *
 * @module
 */

/** Cause taxonomy for user-notes-ref divergence. */
export type UserSyncCause =
  | "unfetched-local"
  | "concurrent-local-writer"
  | "cross-machine"
  | "offline"
  | "unknown";

/** Confidence in the inferred cause. `offline` is a degraded-mode label. */
export type UserSyncCauseConfidence = "high" | "low" | "offline";

/**
 * Pre-computed relation between local and remote user-notes refs. The helper
 * does no IO; the call site derives this from existing ref inspection (e.g.
 * `inspectUserSyncRefsDetailed.state`). `local-missing` and `remote-unavailable`
 * are degraded modes the helper short-circuits to `unknown`.
 */
export type UserSyncRefRelation =
  | "same"
  | "local-ahead"
  | "remote-ahead"
  | "diverged"
  | "remote-unavailable"
  | "local-missing";

export interface InferUserSyncCauseInput {
  /** Pre-computed local/remote ref relation; supplied by the call site. */
  refRelation: UserSyncRefRelation;
  /** Hash that `refs/notes/arc/user/{identity}` points to locally; null if absent. */
  localRefHash: string | null;
  /** Hash the same ref points to on the remote after fetch; null when offline or remote-unavailable. */
  remoteRefHash: string | null;
  /** `LocalSyncState.sourceCommit` — working-tree commit at last save/load. Null when sync-state record absent. */
  sourceCommit: string | null;
  /** `LocalSyncState.savedAt` (ISO-8601). Null for v2 pre-savedAt records or when sync-state is missing. */
  savedAt: string | null;
  /** Local notes-ref tip recorded by this worktree's last save/load. Null for legacy sync-state records. */
  localSyncNotesRefTip: string | null;
  /** Latest annotated commit in the local notes-ref history walk; null when history is empty. */
  latestNoteRefHistoryEntry: string | null;
  /** Whether `sourceCommit` is reachable from current HEAD. */
  headReachable: boolean;
  /** Whether `--offline` was set; collapses cross-machine signals to a degraded label. */
  offline: boolean;
  /** Reference time for `savedAt` recency comparison (Unix ms). Defaults to `Date.now()` when omitted. */
  now?: number;
}

export interface InferUserSyncCauseOutput {
  cause: UserSyncCause;
  confidence: UserSyncCauseConfidence;
}

/**
 * Maximum age of `savedAt` before confidence drops from `high` to `low`. Picked
 * to span typical multi-day work cycles without flagging routine cross-day
 * resumes as stale.
 */
export const SAVED_AT_RECENCY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Classify the cause of user-notes-ref divergence.
 *
 * Design choice — **focused taxonomy**: the helper assumes the call site has
 * already detected divergence (`refRelation !== "same"`). Calling with
 * `refRelation: "same"` returns `unknown` defensively rather than introducing a
 * `none`/`no-divergence` cause value; the documented taxonomy stays at five
 * values, and the call site retains responsibility for the no-divergence path.
 *
 * @param input - Precomputed ref/sync state; see {@link InferUserSyncCauseInput}.
 * @returns Cause and confidence; never throws.
 */
export function inferUserSyncCause(
  input: InferUserSyncCauseInput,
): InferUserSyncCauseOutput {
  if (input.offline) {
    return { cause: "offline", confidence: "offline" };
  }

  if (input.sourceCommit === null) {
    return { cause: "unknown", confidence: "low" };
  }

  const confidence = recencyConfidence(input.savedAt, input.now);

  switch (input.refRelation) {
    case "remote-ahead":
      return { cause: "unfetched-local", confidence };

    case "diverged":
      if (localTipAdvancedPastThisWorktree(input)) {
        return { cause: "concurrent-local-writer", confidence };
      }
      return { cause: "cross-machine", confidence };

    case "local-ahead": {
      if (localTipAdvancedPastThisWorktree(input)) {
        return { cause: "concurrent-local-writer", confidence };
      }
      const concurrentWriter =
        !input.headReachable
        && input.latestNoteRefHistoryEntry !== null
        && input.latestNoteRefHistoryEntry !== input.sourceCommit;
      if (concurrentWriter) {
        return { cause: "concurrent-local-writer", confidence };
      }
      return { cause: "unknown", confidence: "low" };
    }

    case "remote-unavailable":
    case "local-missing":
    case "same":
    default:
      return { cause: "unknown", confidence: "low" };
  }
}

function localTipAdvancedPastThisWorktree(input: InferUserSyncCauseInput): boolean {
  return input.localSyncNotesRefTip !== null
    && input.localRefHash !== null
    && input.localSyncNotesRefTip !== input.localRefHash;
}

function recencyConfidence(
  savedAt: string | null,
  now: number | undefined,
): "high" | "low" {
  if (savedAt === null) return "low";
  const parsed = Date.parse(savedAt);
  if (Number.isNaN(parsed)) return "low";
  const reference = now ?? Date.now();
  return reference - parsed < SAVED_AT_RECENCY_THRESHOLD_MS ? "high" : "low";
}
