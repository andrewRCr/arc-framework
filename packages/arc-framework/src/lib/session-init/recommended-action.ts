/**
 * Pre-computed sync-pull recommendations for session-init Step 2.
 *
 * Pure helper: takes resolved worktree/user/dirty signals plus the relevant
 * `session.init_pull.*` policies and returns the action verb plus composed
 * prompt text per channel. The session-init workflow renders the strings
 * verbatim instead of re-deriving them from state×config conditionals.
 *
 * @module
 */

import type { DirtyStateResult } from "../git/dirty-state.js";
import type { WorktreeSyncStatusResult } from "../git/worktree-sync.js";
import type { BaseDistanceStatusResult } from "../git/base-distance.js";
import type { UserSessionInitStatusResult } from "../../commands/user/types.js";

/**
 * Action verb the session-init workflow performs on a sync-pull channel.
 *
 * - `pull` — fire the channel's pull immediately (notes-only `always` mode).
 * - `prompt` — issue the prompt; a non-empty `recommendedPromptText` accompanies.
 * - `surface` — surface the channel's state in orientation; do not prompt or pull.
 * - `skip` — channel is in a no-action state.
 */
export type RecommendedAction = "pull" | "prompt" | "surface" | "skip";

/** Notes-channel pull policy. Mirrors `session.init_pull.notes` enum. */
export type NotesPullPolicy = "manual" | "prompt" | "always";

/** Worktree-channel pull policy. Mirrors `session.init_pull.worktree` enum (no `always`). */
export type WorktreePullPolicy = "manual" | "prompt";

/** Per-channel recommendation. */
export interface ChannelRecommendation {
  recommendedAction: RecommendedAction;
  /** Composed prompt text when `recommendedAction === "prompt"`; empty string otherwise. */
  recommendedPromptText: string;
}

/** Inputs to {@link inferSessionInitRecommendations}. */
export interface RecommendationInput {
  worktree: WorktreeSyncStatusResult;
  /** Resolved user session-init result, or null when identity missing or probe failed. */
  user: UserSessionInitStatusResult | null;
  worktreePullPolicy: WorktreePullPolicy;
  notesPullPolicy: NotesPullPolicy;
  dirty: DirtyStateResult;
}

/** Output of {@link inferSessionInitRecommendations}. */
export interface RecommendationOutput {
  worktree: ChannelRecommendation;
  user: ChannelRecommendation;
  /**
   * Combined per-channel offer text composed when both channels have
   * `recommendedAction === "prompt"`. Null when only one or neither prompts.
   */
  recommendedCombinedPrompt: string | null;
}

const DIRTY_TREE_WARNING = "Working tree dirty — stash or commit before accepting.";

/**
 * Compose the worktree channel recommendation.
 *
 * State table (config × state):
 * - `remote-ahead` + `prompt` → action=prompt, channel-named + count-included prompt text.
 * - `remote-ahead` + `manual` → action=surface, prompt text empty.
 * - `local-ahead` / `diverged` / `branch-gone` / `remote-unavailable` → action=surface, prompt text empty.
 * - `clean` / `no-upstream` / `detached-head` / `no-remote` / `skipped` → action=skip.
 *
 * `branch-gone` surfaces rather than prompts: the recovery (cascade + candidate
 * prompt) is a state-keyed workflow arm, not a new `recommendedAction` member.
 */
function inferWorktree(
  worktree: WorktreeSyncStatusResult,
  policy: WorktreePullPolicy,
  dirty: DirtyStateResult,
): ChannelRecommendation {
  switch (worktree.state) {
    case "remote-ahead":
      if (policy === "prompt") {
        return {
          recommendedAction: "prompt",
          recommendedPromptText: composeWorktreePromptText(worktree.behind, dirty),
        };
      }
      return { recommendedAction: "surface", recommendedPromptText: "" };
    case "local-ahead":
    case "diverged":
    case "branch-gone":
    case "remote-unavailable":
      return { recommendedAction: "surface", recommendedPromptText: "" };
    case "clean":
    case "no-upstream":
    case "detached-head":
    case "no-remote":
    case "skipped":
      return { recommendedAction: "skip", recommendedPromptText: "" };
  }
}

/** Max overlapping paths named inline before the remainder collapses to a count. */
const OVERLAP_SAMPLE_SIZE = 3;

/**
 * Compose the base-distance channel recommendation — the behind-base reconcile
 * advisory.
 *
 * Only behind-base drift (`remote-ahead` / `diverged`) warrants a surface; the
 * branch being merely ahead of an unmoved base (`local-ahead`), at parity
 * (`clean`), or in any degraded state surfaces nothing. The recommendation is
 * always `surface` (never `prompt`): it is advisory orientation, never an
 * action gate — the workflow renders it and the developer decides whether to
 * reconcile.
 *
 * Returns skip when `baseDistance` is null (slot failed to resolve).
 */
export function inferBaseDistance(
  baseDistance: BaseDistanceStatusResult | null,
): ChannelRecommendation {
  if (baseDistance === null) {
    return { recommendedAction: "skip", recommendedPromptText: "" };
  }
  switch (baseDistance.state) {
    case "remote-ahead":
    case "diverged":
      return {
        recommendedAction: "surface",
        recommendedPromptText: composeBaseDistancePromptText(baseDistance),
      };
    case "clean":
    case "local-ahead":
    case "skipped":
    case "no-upstream":
    case "detached-head":
    case "no-remote":
    case "branch-gone":
    case "remote-unavailable":
      return { recommendedAction: "skip", recommendedPromptText: "" };
  }
}

function composeBaseDistancePromptText(baseDistance: BaseDistanceStatusResult): string {
  const base = baseDistance.base ?? "base";
  const head = `Base \`${base}\` has advanced ${baseDistance.behind} commit(s) ahead of this branch.`;
  const overlap =
    baseDistance.overlappingPaths.length > 0
      ? `Overlapping paths: ${formatOverlap(baseDistance.overlappingPaths)} — rebase may conflict.`
      : "No overlapping paths.";
  return `${head}\n${overlap}\nReconcile?`;
}

function formatOverlap(paths: string[]): string {
  const sample = paths
    .slice(0, OVERLAP_SAMPLE_SIZE)
    .map((path) => `\`${path}\``)
    .join(", ");
  const remainder = paths.length - OVERLAP_SAMPLE_SIZE;
  return remainder > 0 ? `${sample} (+${remainder} more)` : sample;
}

function composeWorktreePromptText(behind: number, dirty: DirtyStateResult): string {
  const head = `Worktree: branch is behind origin by ${behind} commit(s).`;
  const trailer = "Pull?";
  if (dirty.state === "dirty") {
    return `${head}\n${DIRTY_TREE_WARNING}\n${trailer}`;
  }
  return `${head}\n${trailer}`;
}

/**
 * Compose the notes channel recommendation.
 *
 * State table (config × state):
 * - `remote-ahead` / `conflict` + `prompt` → action=prompt, channel-named prompt text.
 * - `remote-ahead` / `conflict` + `always` → action=pull, prompt text empty.
 * - `remote-ahead` / `conflict` + `manual` → action=surface, prompt text empty.
 * - `remote-unavailable` → action=surface, prompt text empty.
 * - `clean` + `refState === "local-ahead"` → action=surface (informational orientation; no pull).
 * - `clean` (otherwise) / `disabled` → action=skip.
 *
 * The `clean` + local-ahead branch reads `refState` because the 5-state
 * `UserSessionInitState` enum encodes pull-direction dispatch and intentionally
 * collapses `same` and `local-ahead` to `clean` — raw topology lives on the
 * parallel `refState` field.
 *
 * Returns skip when `user` is null (identity missing or probe failed) — the
 * notes channel has no path without identity.
 */
function inferUser(
  user: UserSessionInitStatusResult | null,
  policy: NotesPullPolicy,
  dirty: DirtyStateResult,
): ChannelRecommendation {
  if (user === null) {
    return { recommendedAction: "skip", recommendedPromptText: "" };
  }
  switch (user.state) {
    case "remote-ahead":
    case "conflict":
      if (policy === "always") {
        return { recommendedAction: "pull", recommendedPromptText: "" };
      }
      if (policy === "prompt") {
        return {
          recommendedAction: "prompt",
          recommendedPromptText: composeNotesPromptText(user.state, dirty),
        };
      }
      return { recommendedAction: "surface", recommendedPromptText: "" };
    case "remote-unavailable":
      return { recommendedAction: "surface", recommendedPromptText: "" };
    case "clean":
      if (user.refState === "local-ahead") {
        return { recommendedAction: "surface", recommendedPromptText: "" };
      }
      return { recommendedAction: "skip", recommendedPromptText: "" };
    case "disabled":
      return { recommendedAction: "skip", recommendedPromptText: "" };
  }
}

function composeNotesPromptText(
  state: "remote-ahead" | "conflict",
  dirty: DirtyStateResult,
): string {
  const head =
    state === "conflict"
      ? "Notes: notes conflict (local and remote diverged)."
      : "Notes: remote notes ref ahead of local.";
  const trailer = "Pull?";
  if (dirty.state === "dirty") {
    return `${head}\n${DIRTY_TREE_WARNING}\n${trailer}`;
  }
  return `${head}\n${trailer}`;
}

function composeCombinedPrompt(
  worktree: WorktreeSyncStatusResult,
  user: UserSessionInitStatusResult,
  dirty: DirtyStateResult,
): string {
  const lines = [
    `Worktree: branch is behind origin by ${worktree.behind} commit(s).`,
    user.state === "conflict"
      ? "Notes: notes conflict (local and remote diverged)."
      : "Notes: remote notes ref ahead of local.",
  ];
  if (dirty.state === "dirty") {
    lines.push(DIRTY_TREE_WARNING);
  }
  lines.push("Pull both / worktree only / notes only / skip?");
  return lines.join("\n");
}

/**
 * Infer the per-channel recommended actions and the combined-prompt text.
 *
 * Pure: no IO, no side effects. Call sites supply resolved probe results;
 * this helper composes the workflow-renderable strings from them.
 */
export function inferSessionInitRecommendations(
  input: RecommendationInput,
): RecommendationOutput {
  const worktreeRec = inferWorktree(input.worktree, input.worktreePullPolicy, input.dirty);
  const userRec = inferUser(input.user, input.notesPullPolicy, input.dirty);

  const combinedPrompt =
    worktreeRec.recommendedAction === "prompt" &&
    userRec.recommendedAction === "prompt" &&
    input.user !== null
      ? composeCombinedPrompt(input.worktree, input.user, input.dirty)
      : null;

  return {
    worktree: worktreeRec,
    user: userRec,
    recommendedCombinedPrompt: combinedPrompt,
  };
}
