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
import type { BaseDistanceStatusResult } from "../../lib/git/base-distance.js";
import type { SupersessionResult } from "../../lib/git/supersession.js";
import type { WorktreeRosterResult } from "../../lib/git/worktree-roster.js";
import type { WorktreeIdentity } from "../../lib/git/worktree-identity.js";
import type { CascadeResolution } from "../../lib/session-init/branch-gone-cascade.js";
import type { StaleWorktreeSweepResult } from "../../lib/session-init/stale-worktree-sweep.js";
import type { RetiredSubdirDetectionResult } from "../../lib/session-init/retired-subdir-detection.js";
import type { ErrandStalenessSweepResult } from "../../lib/session-init/errand-staleness-sweep.js";
import type { ErrandStateResult } from "../../lib/session-init/errand-state.js";
import type { MaterializableWorkUnitsResult } from "../../lib/session-init/materializable-work-units.js";
import type { WorkUnitStateResult } from "../../lib/session-init/work-unit-state.js";
import type { InboxStateResult } from "../../lib/session-init/inbox-state.js";
import type { ClassComposition } from "../../lib/status/class-composition.js";
import type { RestateCandidatesResult } from "../../lib/handoff/restate-candidates.js";
import type { ReleaseRoutingValue } from "../../lib/release/routing.js";
import type { RecommendedAction } from "../../lib/session-init/recommended-action.js";

export type { RecommendedAction, WorktreeIdentity };

/**
 * Worktree slot in the session-init envelope. Extends the raw probe result
 * with a precomputed action + prompt text the workflow renders directly.
 */
export interface SessionInitWorktreeValue extends WorktreeSyncStatusResult {
  recommendedAction: RecommendedAction;
  /** Composed prompt text when `recommendedAction === "prompt"`; empty string otherwise. */
  recommendedPromptText: string;
  /**
   * Which physical worktree the session is in. Folded in from the
   * `worktreeIdentity` probe; defaults to `{ kind: "primary" }` when that
   * probe failed. Orientation surfaces a `worktree:` line only when `linked`.
   */
  identity: WorktreeIdentity;
  /**
   * Patch-equal supersession verdict, computed only in the `diverged` sub-state
   * (a finer classification of the same HEAD-vs-`origin/<branch>` ref pair this
   * slot already owns). `null` on every non-diverged state and when the bounded
   * detector did not run or failed. When `superseded`, the diverged handler
   * swaps its generic reconcile for the lossless-reset offer carried in
   * `recommendedPromptText`.
   */
  supersession: SupersessionResult | null;
}

/**
 * Base-distance slot in the session-init envelope. Extends the raw probe
 * result (HEAD vs `origin/<base>`) with the same precomputed action + prompt
 * text pair as the worktree slot, so the workflow renders a behind-base
 * reconcile offer without re-deriving it from state.
 */
export interface SessionInitBaseDistanceValue extends BaseDistanceStatusResult {
  recommendedAction: RecommendedAction;
  /** Composed orientation text when `recommendedAction === "surface"`; empty string otherwise. */
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
  /**
   * Base-distance slot — HEAD vs `origin/<base>`, the behind-base drift
   * surface. Always present (eager, non-gated), mirroring the worktree slot's
   * placement; the recommendation fields drive the resume-time reconcile offer.
   */
  baseDistance: Probe<SessionInitBaseDistanceValue>;
  dirty: Probe<DirtyStateResult>;
  extensions: Probe<ExtensionsSessionInitResult>;
  config: Probe<ConfigSessionInitResult>;
  active: Probe<ActiveSessionInitResult>;
  domainRules: Probe<DomainRulesSessionInitResult>;
  releaseRouting: Probe<ReleaseRoutingValue>;
  /**
   * Pre-computed in-flight worktree roster, identity-filtered. Present when the
   * orchestrator's gated second phase fires: worktree state `branch-gone`,
   * active `resolution === "none"`, OR a primary (main) worktree (the
   * stale-worktree sweep's gate). Omitted on the linked-worktree resume path
   * (the scan never runs — resume latency is unchanged). Feeds the branch-gone
   * resolution cascade and the stale-worktree sweep; absent means "no roster
   * was computed", not "an empty roster".
   */
  roster?: Probe<WorktreeRosterResult>;
  /**
   * Pre-computed branch-gone recovery resolution. Present ONLY on the
   * branch-gone arm (narrower than the roster's branch-gone / no-WU gate) and
   * only when the roster resolved — it consumes that roster to assemble
   * candidate destinations. Carries the cascade outcome (`resolved` /
   * `surface` / `main-fallback`) the workflow renders into the single-prompt
   * recovery arm. Absent on every other path.
   */
  recovery?: Probe<CascadeResolution>;
  /**
   * Pre-computed stale-worktree sweep. Present ONLY in the primary (main)
   * worktree and only when the roster resolved — it consumes that roster,
   * cross-references it against `.arc/completed/`, and resolves each lingering
   * shipped-WU worktree's marker-gated cleanup disposition. Absent in linked
   * worktrees (the resume path never sweeps) and when the roster failed.
   */
  sweep?: Probe<StaleWorktreeSweepResult>;
  /**
   * Pre-computed retired-subdir detection — lingering retired-WU user subdirs
   * (shipped + absent from the recent-notes window) under `user/{identity}/`.
   * Read-only surface; the actual reconcile (with `.internal/` backup) happens
   * at `arc user load` / `pull`. Present whenever identity resolved (a cheap
   * always-on slot); omitted only when identity is absent.
   */
  retiredSubdirs?: Probe<RetiredSubdirDetectionResult>;
  /**
   * Pre-computed errand-staleness sweep — errands pending past the configured
   * threshold (`inbox.remind_after_days`, default 1), surfaced for
   * execute-or-demote. Advisory only. Present whenever identity resolved (the
   * source is identity-scoped); omitted only when identity is absent. Unlike the
   * worktree sweep it is not worktree-gated.
   */
  errandSweep?: Probe<ErrandStalenessSweepResult>;
  /**
   * Pre-computed errand-state probe. Present when the worktree and active
   * slots resolved, because those slots provide the current branch and
   * backing-meta signal. Carries the current-branch errand-resume arm,
   * Orient-only in-flight `chore/` advisories, remote-only materialization
   * candidates, and the rate-limit marker state for reminder/stale nudges.
   */
  errandState?: Probe<ErrandStateResult>;
  /**
   * Pre-computed materializable-WU candidates — the oracle's remote-only owned
   * in-flight work units, the discovery surface the Materialize arm offers for
   * cross-machine pickup. Present ONLY on the no-active-WU arm
   * (`active.resolution === "none"`), where the oracle's network slice fires; the
   * resume path skips it entirely (zero oracle cost). An empty `candidates` array
   * means the oracle ran and found none (or the remote was unreachable); absence
   * of the slot means it never ran.
   */
  materializableWorkUnits?: Probe<MaterializableWorkUnitsResult>;
  /**
   * Pre-computed work-unit completion sweep — owned in-flight (`Integrating`)
   * WUs classified across the completion tail (`awaiting-review` / `mergeable` /
   * `blocked` / `merged-needs-archival` / `stale`). Present on the same arms the
   * roster resolves (primary / no-active-WU / branch-gone) — it consumes that
   * roster; omitted on the linked-worktree resume path. The presence tier is
   * network-free; the mergeable-sharpening tier (live PR state via `gh`) fires
   * only on the no-active-WU arm and degrades to presence when `gh` is absent.
   */
  workUnitState?: Probe<WorkUnitStateResult>;
  /**
   * Pre-computed inbox-state probe — the routable-entry count in `USER-INBOX`
   * and a `housekeepNeeded` flag, so the Orient arm offers housekeep from a
   * machine-resolved signal rather than an agent re-scan. Present whenever
   * identity resolved (the source is identity-scoped); omitted only when
   * identity is absent.
   */
  inboxState?: Probe<InboxStateResult>;
  /**
   * Pre-computed plate-balance signal — the resolved `Class` composition
   * (`Novel` / `Heavy` / `Light` counts) of the in-flight work units the roster
   * surfaces, with `[TBD]` / field-absent rows excluded from the tally. Present
   * only on the no-active-WU arm when the in-flight slice is non-empty (omitted
   * otherwise). Read by next-work discovery to render the one-line plate-balance
   * advisory when a `Heavy` / `Novel` stream is already in flight.
   */
  inFlightComposition?: ClassComposition;
  /**
   * Pre-resolved path to the active WU's coordinating `cohort-<leaf>.md`,
   * relative to cwd (forward-slash normalized). Present only when the active
   * meta carries a `Cohort` value and the backing doc exists under
   * `backlog/planned/`; omitted otherwise. The session-init workflow reads it
   * during context-load to surface cross-member coordination awareness.
   */
  cohortDocPath?: string;
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
  source: "git-config" | "default";
}

/**
 * Session-handoff composite result — `--session-handoff` consumer shape.
 *
 * Self-contained: arc-handoff is skill-invoked and shouldn't depend on
 * session-init context still being intact. Slots cover dirty-state, worktree
 * sync vs origin, notes sync (user), the sync-interlock gate, the resolved
 * active status file, current HEAD short-hash for the `Commit at Handoff`
 * anchor, inbox state for the between-WUs housekeep offer, and pushability
 * pre-checks gating the worktree push. Push-interlock and notes-push policy
 * are owned by `arc sync` internally; the handoff workflow doesn't read them.
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
   * Pre-computed inbox-state probe — the routable-entry count in `USER-INBOX`
   * and a `housekeepNeeded` flag, so the between-WUs handoff branch can offer
   * housekeep from a machine-resolved signal rather than an agent re-scan.
   * Present whenever identity resolved; omitted only when identity is absent.
   */
  inboxState?: Probe<InboxStateResult>;
  /**
   * State-aware top-of-Confirm-Handoff line, populated only when sync
   * auto-invoke would skip (`syncInterlock.value === "manual"` or identity
   * absent). Carries `**Reconcile required:** ...` on diverged worktree or
   * `**Worktree:** N unpushed commit(s) on \`branch\`.` on local-ahead;
   * `null` when nothing warrants a top-level surface. The probe captures
   * `worktree` before the selected handoff path mutates state — if the
   * active-WU path fires a chore commit, the rendered unpushed-count is one
   * short of post-commit truth. The workflow handles that adjustment when
   * prepending the line.
   */
  recommendedSummaryLine: string | null;
}

/**
 * Probe slots shared by both session-scoped entry points (`session-init` and
 * `session-handoff`). The two probe interfaces below extend this base so the
 * five slots stay declared once — the orchestrator wires them through a single
 * `buildSessionSharedSlots` source rather than re-declaring each per entry
 * point. Full mode (`StatusProbes`) shares only the `user` identity-missing
 * triad (via the generic `userSlot` helper), since its `user` / `active` slots
 * carry different result types and signatures.
 */
export interface SessionSharedProbes {
  user: (identity: string) => Promise<UserSessionInitStatusResult>;
  worktree: () => Promise<WorktreeSyncStatusResult>;
  dirty: () => Promise<DirtyStateResult>;
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
  releaseRouting: () => Promise<ReleaseRoutingValue>;
}

/** Probe functions in session-init mode — bound to cwd and any required I/O. */
export interface SessionInitProbes extends SessionSharedProbes {
  /**
   * Physical-worktree detection (primary vs. linked). Local rev-parse only —
   * no network — so it rides every session-init pass. Folded onto the worktree
   * slot in the orchestrator rather than surfaced as a top-level slot.
   */
  worktreeIdentity: () => Promise<WorktreeIdentity>;
  /**
   * Base-distance probe — HEAD vs `origin/<base>`. Session-init-only (not a
   * shared slot): a between-WU resume is where behind-base drift matters. The
   * handler binds the resolved `branch.base` and remote-sync flag.
   */
  baseDistance: () => Promise<BaseDistanceStatusResult>;
  /**
   * Patch-equal supersession detector — `git cherry` over the local-ahead set,
   * receiving the current branch from the orchestrator. Called ONLY when the
   * worktree slot resolved to `diverged` (a bounded read on the one state where
   * supersession is meaningful), so the common resume path pays nothing.
   */
  supersession: (branch: string) => Promise<SupersessionResult>;
  extensions: () => Promise<ExtensionsSessionInitResult>;
  config: () => Promise<ConfigSessionInitResult>;
  domainRules: () => Promise<DomainRulesSessionInitResult>;
  /**
   * In-flight worktree roster scan, identity-filtered (`git worktree list` +
   * per-worktree meta reads). Always provided — the orchestrator owns the
   * firing decision and calls this ONLY on the branch-gone / no-WU branch, so
   * the expensive scan never touches the common resume path. The handler binds
   * the identity + team-mode filter (team mode drops other identities; solo
   * mode is a pass-through).
   */
  roster: () => Promise<WorktreeRosterResult>;
  /**
   * Branch-gone recovery resolver. Receives the already-resolved roster and the
   * current (branch-gone) branch from the orchestrator; the handler gathers the
   * recent-branch tier + per-worktree signals and resolves the cascade. Called
   * ONLY on the branch-gone arm when the roster resolved.
   */
  recovery: (
    roster: WorktreeRosterResult,
    currentBranch: string | null,
  ) => Promise<CascadeResolution>;
  /**
   * Stale-worktree sweep resolver. Receives the already-resolved roster and the
   * session's worktree identity from the orchestrator; the handler binds the
   * cwd, base branch, and `.arc/completed/` reader. Called ONLY in the primary
   * worktree when the roster resolved.
   */
  sweep: (
    roster: WorktreeRosterResult,
    worktreeIdentity: WorktreeIdentity,
  ) => Promise<StaleWorktreeSweepResult>;
  /**
   * Retired-subdir detection resolver. Receives the resolved identity and reads
   * `user/{identity}/` + `.arc/completed/` (cheap) plus a gated recent-notes
   * read. Fired in the eager phase whenever identity resolved; read-only.
   */
  retiredSubdirs: (identity: string) => Promise<RetiredSubdirDetectionResult>;
  /**
   * Errand-staleness sweep resolver. Receives the resolved identity; the handler
   * resolves the candidate entries and the `inbox.remind_after_days` threshold,
   * then ages them. Fired in the eager phase whenever identity resolved;
   * advisory, read-only.
   */
  errandSweep: (identity: string) => Promise<ErrandStalenessSweepResult>;
  /**
   * Errand-state resolver. The orchestrator supplies the current branch,
   * backing-meta signal, and the Orient/discovery gate. The handler binds the
   * shared in-flight oracle (errand discovery derives from it), config, and
   * nudge-marker reads.
   */
  errandState: (input: {
    currentBranch: string | null;
    hasBackingMeta: boolean;
    includeDiscovery: boolean;
  }) => Promise<ErrandStateResult>;
  /**
   * Materializable-WU oracle slice. Fires the oracle's bounded network read
   * (remote membership → in-flight derivation → remote-only owned filter) to
   * surface the operator's cross-machine materialize candidates. The handler
   * binds the git executor, identity, and team-mode filter; the orchestrator
   * calls this ONLY on the no-active-WU arm so the resume path pays no oracle
   * cost. An unreachable remote degrades to an empty candidate list.
   */
  materializableWorkUnits: () => Promise<MaterializableWorkUnitsResult>;
  /**
   * Work-unit completion-sweep resolver. Receives the already-resolved roster
   * and a sharpening gate from the orchestrator; the handler binds the git
   * executor, identity, staleness threshold, and — when `includeSharpening` —
   * the `gh`-backed PR source. Called ONLY when the roster resolved (primary /
   * no-active-WU / branch-gone); sharpening is requested only on the
   * no-active-WU arm.
   */
  workUnitState: (input: {
    roster: WorktreeRosterResult;
    includeSharpening: boolean;
  }) => Promise<WorkUnitStateResult>;
  /**
   * Inbox-state resolver. Receives the resolved identity; the handler reads
   * `user/{identity}/USER-INBOX.md` and counts its routable entries. Fired in
   * the eager phase whenever identity resolved; advisory, read-only.
   */
  inboxState: (identity: string) => Promise<InboxStateResult>;
  /**
   * Active-WU cohort-doc resolver. Receives the resolved active meta path; the
   * handler binds the cwd and filesystem ops. Reads the meta's `Cohort` value
   * and resolves the coordinating `cohort-<leaf>.md` under `backlog/planned/`,
   * returning its path or `null`. Called ONLY when the active slot resolved to a
   * single work unit; degrades to `null` on any miss.
   */
  cohortDoc: (activeMetaPath: string) => Promise<string | null>;
}

/** Probe functions in session-handoff mode — bound to cwd and any required I/O. */
export interface SessionHandoffProbes extends SessionSharedProbes {
  syncInterlock: () => Promise<HandoffSyncInterlock>;
  head: () => Promise<HeadHashResult>;
  pushability: () => Promise<PushabilityResult>;
  restateCandidates: () => Promise<RestateCandidatesResult>;
  inboxState: (identity: string) => Promise<InboxStateResult>;
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
