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
 * - `local-ahead` / `diverged` / `remote-unavailable` → action=surface, prompt text empty.
 * - `clean` / `no-upstream` / `detached-head` / `no-remote` / `skipped` → action=skip.
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
 * - `clean` / `disabled` → action=skip.
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
