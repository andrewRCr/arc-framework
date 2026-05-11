/**
 * Type contracts for `arc status` — the composite probe orchestrator.
 *
 * The composite fans out to the four standalone probes (user, extensions,
 * config, active) and folds their results into a single envelope. Session-init
 * consumes this in place of its own Batch 1 git-config reads and four separate
 * CLI invocations.
 *
 * Each probe slot is wrapped in a {@link Probe} discriminated union so
 * per-probe failures surface through the result shape rather than process
 * exit — the agent decides what to do with a partial result. Top-level
 * `identity` is populated by direct `git config` reads in the handler,
 * logically parallel to the probe fan-out.
 */
import type {
  ActiveSessionInitResult,
  ActiveStatusResult,
} from "../active/types.js";
import type {
  ConfigSessionInitResult,
  ConfigStatusResult,
} from "../config/types.js";
import type { DomainRulesSessionInitResult } from "../constitution/types.js";
import type {
  ExtensionsSessionInitResult,
  ExtensionsStatusResult,
} from "../extensions/types.js";
import type {
  UserSessionInitStatusResult,
  UserStatusResult,
} from "../user/types.js";
import type { DirtyStateResult } from "../../lib/git/dirty-state.js";
import type { HeadHashResult } from "../../lib/git/head-hash.js";
import type { PushabilityResult } from "../../lib/git/pushability.js";
import type { WorktreeSyncStatusResult } from "../../lib/git/worktree-sync.js";
import type { RestateCandidatesResult } from "../../lib/handoff/restate-candidates.js";
import type { ReleaseRoutingValue } from "../../lib/release/routing.js";
import type { RecommendedAction } from "../../lib/session-init/recommended-action.js";

export type { RecommendedAction };

/**
 * Worktree slot in the session-init envelope. Extends the raw probe result
 * with a precomputed action + prompt text the workflow renders directly.
 */
export interface SessionInitWorktreeValue extends WorktreeSyncStatusResult {
  recommendedAction: RecommendedAction;
  /** Composed prompt text when `recommendedAction === "prompt"`; empty string otherwise. */
  recommendedPromptText: string;
}

/**
 * User slot in the session-init envelope. Extends the standalone probe
 * result with the same recommendation pair as the worktree slot.
 */
export interface SessionInitUserValue extends UserSessionInitStatusResult {
  recommendedAction: RecommendedAction;
  recommendedPromptText: string;
}

/** Git-config pointers resolved in the composite handler (not a probe). */
export interface StatusIdentity {
  /** `git config arc.identity` value; empty and absent normalize to `null`. */
  identity: string | null;
  /** `git config arc.role` value; empty and absent normalize to `null`. */
  role: string | null;
}

/**
 * Per-probe failure reason.
 *
 * - `identity-missing` — user probe short-circuited because `arc.identity`
 *   was absent. Other probes do not use identity and never emit this kind.
 * - `runtime` — probe threw (e.g., missing extensions directory on a partial
 *   install). `message` is the `Error.message` or stringified value.
 */
export interface ProbeError {
  kind: "identity-missing" | "runtime";
  message: string;
}

/** Discriminated union for a probe slot — success or typed error. */
export type Probe<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProbeError };

/** Full-mode composite result — default (no-flag) rendering. */
export interface StatusResult {
  mode: "full";
  identity: StatusIdentity;
  user: Probe<UserStatusResult>;
  extensions: Probe<ExtensionsStatusResult>;
  config: Probe<ConfigStatusResult>;
  active: Probe<ActiveStatusResult>;
}

/** Session-init-scoped composite result — `--session-init` consumer shape. */
export interface SessionInitProbeResult {
  mode: "session-init";
  identity: StatusIdentity;
  user: Probe<SessionInitUserValue>;
  worktree: Probe<SessionInitWorktreeValue>;
  dirty: Probe<DirtyStateResult>;
  extensions: Probe<ExtensionsSessionInitResult>;
  config: Probe<ConfigSessionInitResult>;
  active: Probe<ActiveSessionInitResult>;
  domainRules: Probe<DomainRulesSessionInitResult>;
  releaseRouting: Probe<ReleaseRoutingValue>;
  /**
   * Per-channel offer text composed when both the worktree and user slots
   * resolve to `recommendedAction === "prompt"`. Null when only one channel
   * (or neither) prompts. Workflow renders verbatim instead of composing
   * combined-prompt prose itself.
   */
  recommendedCombinedPrompt: string | null;
}

/** Probe functions in full mode — bound to cwd and any required I/O. */
export interface StatusProbes {
  /**
   * User-sync probe. Receives `identity` at call time so the composite can
   * short-circuit the user slot when `arc.identity` is absent without ever
   * invoking this function.
   */
  user: (identity: string) => Promise<UserStatusResult>;
  extensions: () => Promise<ExtensionsStatusResult>;
  config: () => Promise<ConfigStatusResult>;
  active: () => Promise<ActiveStatusResult>;
}

/**
 * Sync-interlock slot in the session-handoff envelope — narrow projection of
 * the per-developer `arc.syncInterlock`. Gates whether the handoff workflow
 * auto-invokes `arc sync`: `on-handoff` and `on-workflow` both fire (the
 * latter is the permissive workflow-mediated tier; today behaviorally
 * equivalent at handoff but reserved for forward-compatibility); `manual`
 * skips and surfaces unpushed state without firing.
 */
export interface HandoffSyncInterlock {
  value: "manual" | "on-handoff" | "on-workflow";
  source: "git-config" | "yaml" | "default";
}

/**
 * Session-handoff composite result — `--session-handoff` consumer shape.
 *
 * Self-contained: arc-handoff is skill-invoked and shouldn't depend on
 * session-init context still being intact. Slots cover dirty-state, worktree
 * sync vs origin, notes sync (user), the sync-interlock gate, the resolved
 * active status file, current HEAD short-hash for the `Commit at Handoff`
 * anchor, and pushability pre-checks gating the worktree push. Push-interlock
 * and notes-push policy are owned by `arc sync` internally; the handoff
 * workflow doesn't read them.
 *
 * `branch` is sourced from the worktree probe slot (where it's already
 * resolved internally) so the Confirm Handoff header and the pre-computed
 * `recommendedSummaryLine` read from one canonical source instead of
 * agent-side `git rev-parse` calls. Falls back to `null` when the worktree
 * probe itself fails — `recommendedSummaryLine` is null on the same condition
 * so downstream consumers tolerate the absence.
 */
export interface SessionHandoffResult {
  mode: "session-handoff";
  identity: StatusIdentity;
  /**
   * Current branch name from the worktree probe; `null` on detached HEAD or
   * when the worktree probe failed.
   */
  branch: string | null;
  dirty: Probe<DirtyStateResult>;
  worktree: Probe<WorktreeSyncStatusResult>;
  user: Probe<UserSessionInitStatusResult>;
  syncInterlock: Probe<HandoffSyncInterlock>;
  active: Probe<ActiveSessionInitResult>;
  head: Probe<HeadHashResult>;
  /**
   * Pushability pre-check matrix for the worktree push leg. Probed with
   * `target: "worktree"` (the worktree push is what the handoff workflow
   * gates on this slot). Worktree-vs-origin divergence is conveyed by the
   * `worktree` slot; the consumer cross-references both for the full
   * picture.
   */
  pushability: Probe<PushabilityResult>;
  /**
   * Structured payload backing the SESSION-NOTES restate filter — commits,
   * task IDs from `Context:` footers, and notes-file path changes since the
   * baseline recorded in SESSION-NOTES. The handoff workflow's filter
   * collapses against this in place of recall-based paraphrase checks. On a
   * structural failure (missing baseline / unreachable commit), the helper
   * emits empty arrays plus a `baseline-unknown` soft signal.
   */
  restateCandidates: Probe<RestateCandidatesResult>;
  /** Resolved release-wrapper routing decisions for workflow fire-site classes. */
  releaseRouting: Probe<ReleaseRoutingValue>;
  /**
   * State-aware top-of-Confirm-Handoff line, populated only when sync
   * auto-invoke would skip (`syncInterlock.value === "manual"` or identity
   * absent). Carries `**Reconcile required:** ...` on diverged worktree or
   * `**Worktree:** N unpushed commit(s) on \`branch\`.` on local-ahead;
   * `null` when nothing warrants a top-level surface. The probe captures
   * `worktree` pre-Step-3 of the handoff workflow — if Step 3 fires a chore
   * commit, the rendered unpushed-count is one short of post-Step-3 truth.
   * The workflow handles that adjustment when prepending the line.
   */
  recommendedSummaryLine: string | null;
}

/** Probe functions in session-init mode — bound to cwd and any required I/O. */
export interface SessionInitProbes {
  user: (identity: string) => Promise<UserSessionInitStatusResult>;
  worktree: () => Promise<WorktreeSyncStatusResult>;
  dirty: () => Promise<DirtyStateResult>;
  extensions: () => Promise<ExtensionsSessionInitResult>;
  config: () => Promise<ConfigSessionInitResult>;
  /**
   * Active probe receives `identity` and `role` so contributor flow can
   * scan `.arc/user/{identity}/active/` instead of the maintainer root.
   * Both pointers are forwarded verbatim from the composite — `null` means
   * the corresponding `git config` key was absent.
   */
  active: (
    identity: string | null,
    role: string | null,
  ) => Promise<ActiveSessionInitResult>;
  domainRules: () => Promise<DomainRulesSessionInitResult>;
  releaseRouting: () => Promise<ReleaseRoutingValue>;
}

/** Probe functions in session-handoff mode — bound to cwd and any required I/O. */
export interface SessionHandoffProbes {
  dirty: () => Promise<DirtyStateResult>;
  worktree: () => Promise<WorktreeSyncStatusResult>;
  user: (identity: string) => Promise<UserSessionInitStatusResult>;
  syncInterlock: () => Promise<HandoffSyncInterlock>;
  active: (
    identity: string | null,
    role: string | null,
  ) => Promise<ActiveSessionInitResult>;
  head: () => Promise<HeadHashResult>;
  pushability: () => Promise<PushabilityResult>;
  restateCandidates: () => Promise<RestateCandidatesResult>;
  releaseRouting: () => Promise<ReleaseRoutingValue>;
}

export interface RunStatusOptions {
  identity: string | null;
  role: string | null;
  probes: StatusProbes;
}

export interface RunSessionInitStatusOptions {
  identity: string | null;
  role: string | null;
  probes: SessionInitProbes;
}

export interface RunSessionHandoffStatusOptions {
  identity: string | null;
  role: string | null;
  probes: SessionHandoffProbes;
}
