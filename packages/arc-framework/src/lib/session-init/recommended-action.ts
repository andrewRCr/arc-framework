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
import type { BaseBranchSyncStatusResult } from "../git/base-branch-sync.js";
import { decideInboundPull } from "../git/inbound-pull.js";
import type { SupersessionResult } from "../git/supersession.js";
import type { UserSessionInitStatusResult } from "../../commands/user/types.js";
import type { RetiredSubdirDetectionResult } from "./retired-subdir-detection.js";

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

/** Base-branch-channel pull policy. Mirrors `session.init_pull.base` enum. */
export type BaseBranchSyncPullPolicy = "manual" | "prompt" | "always";

/** Notes-load channel policy. Mirrors `session.init_load.notes` enum. */
export type NotesLoadPolicy = "manual" | "prompt" | "always";

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
  /**
   * Patch-equal supersession verdict for the diverged sub-state, or null when
   * not diverged / not computed. When superseded, the worktree channel
   * downgrades its generic reconcile to the lossless-reset offer.
   */
  supersession: SupersessionResult | null;
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

const DIRTY_LOAD_WARNING = "Stash or commit local edits before loading.";

/**
 * Compose the worktree channel recommendation.
 *
 * State table (config × state):
 * - `remote-ahead` + `prompt` → action=prompt, channel-named + count-included prompt text.
 * - `remote-ahead` + `manual` → action=surface, prompt text empty.
 * - `diverged` + patch-equal supersession → action=surface, downgraded lossless-reset offer text.
 * - `local-ahead` / `diverged` / `branch-gone` / `remote-unavailable` → action=surface, prompt text empty.
 * - `clean` / `no-upstream` / `detached-head` / `no-remote` / `skipped` → action=skip.
 *
 * `branch-gone` surfaces rather than prompts: the recovery (cascade + candidate
 * prompt) is a state-keyed workflow arm, not a new `recommendedAction` member.
 *
 * `diverged` stays `surface` in both cases — the workflow renders the generic
 * reconcile from state. When the local-ahead commits are patch-equal to a
 * rebased remote prefix (`supersession.superseded`), the channel additionally
 * carries the downgraded "superseded — reset is lossless" prompt text + reset
 * offer; the workflow swaps to it. Genuine divergence keeps the empty text.
 */
function inferWorktree(
  worktree: WorktreeSyncStatusResult,
  policy: WorktreePullPolicy,
  dirty: DirtyStateResult,
  supersession: SupersessionResult | null,
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
    case "diverged":
      return {
        recommendedAction: "surface",
        recommendedPromptText: supersession?.superseded
          ? composeSupersessionPromptText(worktree.branch)
          : "",
      };
    case "local-ahead":
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

/**
 * Compose the diverged-handler supersession downgrade: local-ahead commits are
 * patch-equal to a rebased remote prefix, so a hard reset to the remote loses
 * nothing. Offers the reset; never auto-runs (the workflow presents it).
 */
function composeSupersessionPromptText(branch: string | null): string {
  const remote = `origin/${branch ?? "<branch>"}`;
  return (
    `Local commits are superseded by rebased equivalents on \`${remote}\` — reset is lossless.\n` +
    `Reset? \`git reset --hard ${remote}\``
  );
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

/**
 * Compose the base-branch-sync channel recommendation — the silently-stale
 * local base advisory and its config-gated fast-forward offer.
 *
 * Delegates the state × policy × dirty-tree decision to the shared
 * {@link decideInboundPull} matrix (the one inbound-pull primitive both this
 * channel and the `arc sync` leg route through), then maps its outcome to the
 * session-init channel vocabulary and composes the advisory text:
 *
 * - `ff-pull` → action=pull (auto-fast-forward; `always` on a clean behind base).
 * - `prompt` → action=prompt, with the fast-forward offer text.
 * - `refuse` (dirty tree) → action=surface, dirty-refusal advisory.
 * - `block` (diverged base) → action=surface, not-fast-forwardable advisory.
 * - `surface` → action=surface with the behind advisory when the base is merely
 *   behind under `manual`; action=skip for degraded states (no actionable text).
 * - `no-op` (base current or only ahead) → action=skip.
 *
 * `isTty` is fixed `true`: the session-init agent always owns the prompt
 * interactively, so the matrix's non-TTY auto-skip is the `arc sync` automated
 * path's concern, not this channel's. Returns skip when `baseBranchSync` is null
 * (slot failed to resolve).
 */
export function inferBaseBranchSync(
  baseBranchSync: BaseBranchSyncStatusResult | null,
  policy: BaseBranchSyncPullPolicy,
  dirty: DirtyStateResult,
): ChannelRecommendation {
  if (baseBranchSync === null) {
    return { recommendedAction: "skip", recommendedPromptText: "" };
  }
  const decision = decideInboundPull({
    compareState: baseBranchSync.state,
    tree: dirty.state,
    policy,
    isTty: true,
  });
  switch (decision) {
    case "ff-pull":
      return { recommendedAction: "pull", recommendedPromptText: "" };
    case "prompt":
      return {
        recommendedAction: "prompt",
        recommendedPromptText: `${composeBaseBranchSyncBehindText(baseBranchSync, false)}\nFast-forward base?`,
      };
    case "refuse":
      return {
        recommendedAction: "surface",
        recommendedPromptText: composeBaseBranchSyncBehindText(baseBranchSync, true),
      };
    case "block":
      return {
        recommendedAction: "surface",
        recommendedPromptText: composeBaseBranchSyncDivergedText(baseBranchSync),
      };
    case "surface":
      // A behind base under `manual` surfaces the advisory; every degraded state
      // also resolves to `surface` here but carries no actionable staleness, so
      // it skips.
      return baseBranchSync.state === "remote-ahead"
        ? {
          recommendedAction: "surface",
          recommendedPromptText: composeBaseBranchSyncBehindText(baseBranchSync, false),
        }
        : { recommendedAction: "skip", recommendedPromptText: "" };
    case "no-op":
      return { recommendedAction: "skip", recommendedPromptText: "" };
  }
}

function composeBaseBranchSyncBehindText(
  baseBranchSync: BaseBranchSyncStatusResult,
  dirty: boolean,
): string {
  const base = baseBranchSync.base;
  const head =
    `Local base \`${base}\` is behind \`origin/${base}\` by ` +
    `${baseBranchSync.behind} commit(s) — fast-forward available.`;
  return dirty ? `${head}\nWorking tree dirty; fast-forward skipped.` : head;
}

function composeBaseBranchSyncDivergedText(baseBranchSync: BaseBranchSyncStatusResult): string {
  const base = baseBranchSync.base;
  return (
    `Local base \`${base}\` has diverged from \`origin/${base}\` ` +
    `(${baseBranchSync.ahead} ahead, ${baseBranchSync.behind} behind) — not fast-forwardable; reconcile manually.`
  );
}

/**
 * Compose the retired-subdir reconcile channel recommendation.
 *
 * The retired-subdir cleanup runs inside `arc user load`, so it rides the
 * notes-LOAD channel and is gated on `session.init_load.notes` — distinct from
 * the notes-PULL policy. The `pull` verb here means "fire `arc user load`" (the
 * channel's auto-action), consistent with the per-channel dispatch rule. The
 * session-init notes-load dispatch fires that one load when `loadNeeded` OR
 * retired candidates are present, so a current-notes machine still reconciles.
 *
 * Candidate presence × policy × dirty-tree:
 * - no candidates → skip (nothing to reconcile, regardless of policy).
 * - `always` + clean tree → pull (auto-reconcile via `arc user load`).
 * - `always` + dirty tree → prompt (degrade to offer — mirrors the notes-load
 *   dirty guard; the pre-load backup protects the auto-path, but a dirty tree
 *   defers to consent).
 * - `prompt` → prompt (offer; no auto-run). Dirty-tree-aware offer text.
 * - `manual` → surface (warn-only orientation; today's behavior).
 *
 * Returns skip when `retiredSubdirs` is null (slot absent — identity missing or
 * probe failed) or carries no candidates.
 */
export function inferRetiredSubdirs(
  retiredSubdirs: RetiredSubdirDetectionResult | null,
  policy: NotesLoadPolicy,
  dirty: DirtyStateResult,
): ChannelRecommendation {
  if (retiredSubdirs === null || retiredSubdirs.candidates.length === 0) {
    return { recommendedAction: "skip", recommendedPromptText: "" };
  }
  const count = retiredSubdirs.candidates.length;
  switch (policy) {
    case "always":
      return dirty.state === "dirty"
        ? {
          recommendedAction: "prompt",
          recommendedPromptText: composeRetiredSubdirPromptText(count, true),
        }
        : { recommendedAction: "pull", recommendedPromptText: "" };
    case "prompt":
      return {
        recommendedAction: "prompt",
        recommendedPromptText: composeRetiredSubdirPromptText(count, dirty.state === "dirty"),
      };
    case "manual":
      return { recommendedAction: "surface", recommendedPromptText: "" };
  }
}

function composeRetiredSubdirPromptText(count: number, dirty: boolean): string {
  const head =
    `${count} retired-WU user subdir(s) linger from shipped work units; ` +
    "reconcile via `arc user load` (with `.internal/` backup)?";
  return dirty ? `${DIRTY_LOAD_WARNING}\n${head}` : head;
}

/**
 * Compose the behind-base advisory text.
 *
 * Recommends merging the base in — never rebasing. Concurrent-work doctrine
 * forbids rewriting a pushed branch (SHA-keyed notes, shared worktrees, review
 * stability); merge is also correct in the private unpushed window, so one
 * append-only recommendation covers both cases. Session-init renders this
 * text verbatim.
 */
function composeBaseDistancePromptText(baseDistance: BaseDistanceStatusResult): string {
  const base = baseDistance.base ?? "base";
  const head = `Base \`${base}\` has advanced ${baseDistance.behind} commit(s) ahead of this branch.`;
  const overlap =
    baseDistance.overlappingPaths.length > 0
      ? `Overlapping paths: ${formatOverlap(baseDistance.overlappingPaths)} — merge may conflict.`
      : "No overlapping paths.";
  return `${head}\n${overlap}\nMerge the base in?`;
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
 * - `remote-ahead` + `prompt` → action=prompt, channel-named prompt text.
 * - `remote-ahead` + `always` → action=pull, prompt text empty.
 * - `remote-ahead` + `manual` → action=surface, prompt text empty.
 * - `conflict` → action=surface under every policy; diverged refs cannot be pulled.
 * - `remote-unavailable` → action=surface, prompt text empty.
 * - `clean` + local-ahead or diverged remote-subset detail → action=surface (informational orientation).
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
      if (policy === "always") {
        return { recommendedAction: "pull", recommendedPromptText: "" };
      }
      if (policy === "prompt") {
        return {
          recommendedAction: "prompt",
          recommendedPromptText: composeNotesPromptText(dirty),
        };
      }
      return { recommendedAction: "surface", recommendedPromptText: "" };
    case "conflict":
      return { recommendedAction: "surface", recommendedPromptText: "" };
    case "remote-unavailable":
      return { recommendedAction: "surface", recommendedPromptText: "" };
    case "clean":
      if (
        user.refState === "local-ahead"
        || (user.refState === "diverged" && user.contentRelation === "remote-subset")
      ) {
        return { recommendedAction: "surface", recommendedPromptText: "" };
      }
      return { recommendedAction: "skip", recommendedPromptText: "" };
    case "disabled":
      return { recommendedAction: "skip", recommendedPromptText: "" };
  }
}

function composeNotesPromptText(
  dirty: DirtyStateResult,
): string {
  const head = "Notes: remote notes ref ahead of local.";
  const trailer = "Pull?";
  if (dirty.state === "dirty") {
    return `${head}\n${DIRTY_TREE_WARNING}\n${trailer}`;
  }
  return `${head}\n${trailer}`;
}

function composeCombinedPrompt(
  worktree: WorktreeSyncStatusResult,
  dirty: DirtyStateResult,
): string {
  const lines = [
    `Worktree: branch is behind origin by ${worktree.behind} commit(s).`,
    "Notes: remote notes ref ahead of local.",
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
  const worktreeRec = inferWorktree(
    input.worktree,
    input.worktreePullPolicy,
    input.dirty,
    input.supersession,
  );
  const userRec = inferUser(input.user, input.notesPullPolicy, input.dirty);

  const combinedPrompt =
    worktreeRec.recommendedAction === "prompt" &&
    userRec.recommendedAction === "prompt" &&
    input.user !== null
      ? composeCombinedPrompt(input.worktree, input.dirty)
      : null;

  return {
    worktree: worktreeRec,
    user: userRec,
    recommendedCombinedPrompt: combinedPrompt,
  };
}
