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
  UserSessionNotesDriftSurface,
  UserStatusResult,
} from "../user/types.js";
import type { DirtyStateResult } from "../../lib/git/dirty-state.js";
import type { HeadHashResult } from "../../lib/git/head-hash.js";
import type { PushabilityResult } from "../../lib/git/pushability.js";
import type { WorktreeSyncStatusResult } from "../../lib/git/worktree-sync.js";
import type { BaseDistanceStatusResult } from "../../lib/git/base-distance.js";
import type { BaseBranchSyncStatusResult } from "../../lib/git/base-branch-sync.js";
import type { SupersessionResult } from "../../lib/git/supersession.js";
import type { WorktreeRosterResult } from "../../lib/git/worktree-roster.js";
import type { WorktreeIdentity } from "../../lib/git/worktree-identity.js";
import type { CascadeResolution } from "../../lib/session-init/branch-gone-cascade.js";
import type { StaleWorktreeSweepResult } from "../../lib/session-init/stale-worktree-sweep.js";
import type { CurrentHuskAdvisory } from "../../lib/session-init/current-husk-advisory.js";
import type { OrphanBranchSweepResult } from "../../lib/session-init/orphan-branch-sweep.js";
import type { RetiredSubdirDetectionResult } from "../../lib/session-init/retired-subdir-detection.js";
import type { ErrandStalenessSweepResult } from "../../lib/session-init/errand-staleness-sweep.js";
import type { ErrandStateResult } from "../../lib/session-init/errand-state.js";
import type { PartialPushMarkerSurfaceResult } from "../../lib/session-init/partial-push-marker-surface.js";
import type { NotesCompactionSessionAdvisoryResult } from "../../lib/session-init/notes-compaction-advisory.js";
import type { MaterializableWorkUnitsResult } from "../../lib/session-init/materializable-work-units.js";
import type { WorkUnitStateResult } from "../../lib/session-init/work-unit-state.js";
import type { InboxStateResult } from "../../lib/session-init/inbox-state.js";
import type { ClassComposition } from "../../lib/status/class-composition.js";
import type { RestateCandidatesResult } from "../../lib/handoff/restate-candidates.js";
import type { ReleaseRoutingValue } from "../../lib/release/routing.js";
import type { RecommendedAction } from "../../lib/session-init/recommended-action.js";
import type { LoadSetManifest } from "../../lib/load-set/types.js";
import type { TaskListCursorFileResult } from "../../lib/task-list/file-cursor.js";

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
 * Base-branch-sync slot in the session-init envelope. Extends the raw probe
 * result (local `<base>` vs `origin/<base>`, plus `checkout` locus) with the
 * config-gated action + prompt pair: `pull` / `prompt` drive the fast-forward
 * freshen only when the base is not checked out; `surface` covers a stale base
 * under `manual`, a base checked out elsewhere (primary-aware), or a diverged
 * base; `skip` a current base or when this worktree holds the base.
 */
export interface SessionInitBaseBranchSyncValue extends BaseBranchSyncStatusResult {
  recommendedAction: RecommendedAction;
  /** Composed offer text when `recommendedAction ∈ {prompt, surface}`; empty string otherwise. */
  recommendedPromptText: string;
}

/**
 * User slot shape shared by the session-scoped envelopes. Extends the
 * standalone probe result with the finalized clean-arm notes/disk drift
 * advisory (D3), resolved from the raw `notesDrift` signal.
 */
export interface SessionUserValue extends UserSessionInitStatusResult {
  /**
   * Finalized clean-arm notes/disk drift advisory (D3), resolved from the raw
   * `notesDrift` signal against the active WU name. Present only when the
   * divergence surfaces (neither a safe auto-load nor benign); the safe sub-case
   * is folded into `loadNeeded` instead. Rendered in the workflow's advisory tier.
   */
  notesDriftSurface?: UserSessionNotesDriftSurface;
}

/**
 * User slot in the session-init envelope. Extends the shared session-user
 * result with the same recommendation pair as the worktree slot.
 */
export interface SessionInitUserValue extends SessionUserValue {
  recommendedAction: RecommendedAction;
  recommendedPromptText: string;
}

/**
 * Retired-subdir slot in the session-init envelope. Extends the raw detection
 * result with the config-gated reconcile recommendation (`session.init_load.notes`):
 * `pull` fires `arc user load` (auto-reconcile), `prompt` offers it, `surface`
 * warns only, `skip` when no candidates linger. `recommendedPromptText` carries
 * the offer when `recommendedAction ∈ {prompt}`; empty string otherwise.
 */
export interface SessionInitRetiredSubdirsValue extends RetiredSubdirDetectionResult {
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

/** JSON-safe summary of a `--write-compaction-seed` attempt. */
export type CompactionSeedWriteStatus =
  | { status: "written"; path: string }
  | { status: "skipped"; reason: "identity-missing" | "load-set-unresolved" }
  | {
    status: "failed";
    reason: "git-failed" | "identity-invalid" | "seed-invalid" | "write-failed";
    message: string;
  };

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
  /**
   * Base-branch-sync slot — local `<base>` vs `origin/<base>`, the
   * silently-stale-local-base surface (sibling to `baseDistance`, which
   * measures HEAD vs `origin/<base>`). Always present (eager, non-gated). The
   * recommendation pair drives the config-gated fast-forward-only freshen offer
   * (`session.init_pull.base`).
   */
  baseBranchSync: Probe<SessionInitBaseBranchSyncValue>;
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
   * Pre-computed residue sweep. Primary sessions consume the public roster;
   * identity-known linked sessions consume a private cleanup-only roster and
   * exclude their exact current path. Absent when the applicable roster fails.
   */
  sweep?: Probe<StaleWorktreeSweepResult>;
  /**
   * Derived orientation for a linked branchless checkout that is an exact,
   * locally completed stamped WU husk. This interim advisory is separate from
   * worktree sync state and may be superseded by a durable locus record.
   * Omitted on ordinary branched/primary paths and when the probe degrades.
   */
  currentHusk?: Probe<CurrentHuskAdvisory | null>;
  /**
   * Pre-computed orphan-branch sweep — type-prefixed local branches whose
   * upstream is gone (integration on a sibling machine, or a local-only
   * `plan/ → <type>/` rename), each with its merged-to-base and shipped-WU
   * verdicts. A `shippedWorkUnit` orphan earns the re-runnable
   * `arc teardown <name>` offer; otherwise a `merged` orphan earns the
   * interlock-gated `git branch -d` offer, and an unmerged one is surfaced as
   * not-removable (never `-D`). Present in primary and identity-known linked
   * sessions; linked rendering combines it with sibling husks.
   */
  orphanBranchSweep?: Probe<OrphanBranchSweepResult>;
  /**
   * Pre-computed retired-subdir detection — lingering retired-WU user subdirs
   * (shipped + carrying no unpushed drift) under `user/{identity}/`. Enriched
   * with the config-gated reconcile recommendation (`session.init_load.notes`):
   * the reconcile (with `.internal/` backup) fires inside `arc user load`,
   * triggered by session-init's notes-load dispatch when `loadNeeded` OR these
   * candidates are present. Present whenever identity resolved (a cheap
   * always-on slot); omitted only when identity is absent.
   */
  retiredSubdirs?: Probe<SessionInitRetiredSubdirsValue>;
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
   * Pre-computed partial-push-marker surface — the cohort sibling's live,
   * non-expired sync-state markers, each a notes push that has not yet arrived
   * at origin (lag, not loss). Rendered as the Aware advisory one-liner in
   * Step 6, co-located with the base-ref surface; the agent proceeds-with-context
   * and never auto-resolves. Present whenever identity resolved (the ref is
   * identity-scoped); omitted only when identity is absent. An empty `markers`
   * array means the ref was read and nothing is live (or the ref is absent —
   * degrade-silent).
   */
  partialPushMarker?: Probe<PartialPushMarkerSurfaceResult>;
  /**
   * Pre-computed user-notes compaction advisory — local notes-ref history size
   * compared to the internal threshold, plus a once-per-calendar-day nudge
   * marker. Present whenever identity resolved; omitted only when identity is
   * absent. Workflow renders it as offer-only guidance and never auto-runs
   * compaction.
   */
  compactionAdvisory?: Probe<NotesCompactionSessionAdvisoryResult>;
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
   * Ordered context load set projected from the resolved session-init state.
   * Purely additive: recovery consumes it as the deterministic context-load
   * contract, while session-init keeps its existing prose-level reads for now.
   */
  loadSet: Probe<LoadSetManifest>;
  /**
   * Deterministic cursor derived from the active task-list checkbox grammar.
   * Present only when `active.value.taskListPath` resolves and passes the same
   * path-safety validation used by `loadSet`. Session-init may use it as a
   * line-anchor helper for strategic reads; it is not thought-state.
   */
  taskCursor?: Probe<TaskListCursorFileResult>;
  /**
   * Present only when `--write-compaction-seed` is requested. Lets harness
   * hooks consume the authoritative seed-write result instead of rebuilding the
   * seed path from envelope fields.
   */
  compactionSeedWrite?: CompactionSeedWriteStatus;
  /**
   * Per-channel offer text composed when both the worktree and user slots
   * resolve to `recommendedAction === "prompt"`. Null when only one channel
   * (or neither) prompts. Workflow renders verbatim instead of composing
   * combined-prompt prose itself.
   */
  recommendedCombinedPrompt: string | null;
}

/** Worktree slot in the recover envelope. No sync recommendations are attached. */
export interface SessionRecoverWorktreeValue extends WorktreeSyncStatusResult {
  /** Which physical worktree the recovered session occupies. */
  identity: WorktreeIdentity;
}

/** Lean recover-mode composite result — `--recover` consumer shape. */
export interface SessionRecoverProbeResult {
  mode: "recover";
  identity: StatusIdentity;
  worktree: Probe<SessionRecoverWorktreeValue>;
  dirty: Probe<DirtyStateResult>;
  extensions: Probe<ExtensionsSessionInitResult>;
  config: Probe<ConfigSessionInitResult>;
  active: Probe<ActiveSessionInitResult>;
  releaseRouting: Probe<ReleaseRoutingValue>;
  /** Present only when a single active WU resolves to a coordinating cohort doc. */
  cohortDocPath?: string;
  /** Ordered context load set projected from the freshly resolved recover state. */
  loadSet: Probe<LoadSetManifest>;
  /** Deterministic task-list cursor, present only when the resolved task-list path is load-set safe. */
  taskCursor?: Probe<TaskListCursorFileResult>;
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
  user: Probe<SessionUserValue>;
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
   * Resolve terminal husk orientation for the current linked worktree. Called
   * only when the worktree sync slot reports `branch: null`.
   */
  currentHusk: (worktreePath: string) => Promise<CurrentHuskAdvisory | null>;
  /**
   * Base-distance probe — HEAD vs `origin/<base>`. Session-init-only (not a
   * shared slot): a between-WU resume is where behind-base drift matters. The
   * handler binds the resolved `branch.base` and remote-sync flag.
   */
  baseDistance: () => Promise<BaseDistanceStatusResult>;
  /**
   * Base-branch-sync probe — local `<base>` vs `origin/<base>`. Session-init-only
   * (a between-WU resume is where a silently-stale local base matters). The
   * handler binds the resolved `branch.base` and remote-sync flag, mirroring the
   * base-distance probe.
   */
  baseBranchSync: () => Promise<BaseBranchSyncStatusResult>;
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
  /** Private linked cleanup roster; never published or fed to general roster consumers. */
  cleanupRoster?: () => Promise<WorktreeRosterResult>;
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
   * base branch and git executor. Called ONLY in the primary worktree when the
   * roster resolved.
   */
  sweep: (
    roster: WorktreeRosterResult,
    worktreeIdentity: WorktreeIdentity,
  ) => Promise<StaleWorktreeSweepResult>;
  /**
   * Orphan-branch sweep resolver. Receives the session's worktree identity; the
   * handler binds the base branch, errand-branch exclusions, and git executor.
   * Called ONLY in the primary worktree — it enumerates gone-upstream local
   * branches itself (no roster dependency).
   */
  orphanBranchSweep: (worktreeIdentity: WorktreeIdentity) => Promise<OrphanBranchSweepResult>;
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
   * Partial-push-marker surface resolver. Receives the resolved identity; the
   * handler binds the git executor and reference time, reads the local
   * sync-state ref, and selects the live, non-expired markers. Fired in the
   * eager phase whenever identity resolved; read-only, network-free.
   */
  partialPushMarker: (identity: string) => Promise<PartialPushMarkerSurfaceResult>;
  /** User-notes compaction advisory resolver. Fired eagerly whenever identity resolved when provided. */
  compactionAdvisory?: (identity: string) => Promise<NotesCompactionSessionAdvisoryResult>;
  /**
   * Active-WU cohort-doc resolver. Receives the resolved active meta path; the
   * handler binds the cwd and filesystem ops. Reads the meta's `Cohort` value
   * and resolves the coordinating `cohort-<leaf>.md` under `backlog/planned/`,
   * returning its path or `null`. Called ONLY when the active slot resolved to a
   * single work unit; degrades to `null` on any miss.
   */
  cohortDoc: (activeMetaPath: string) => Promise<string | null>;
  /** Resolve the deterministic task-list cursor for a resolved task-list path. */
  taskCursor: (taskListPath: string) => Promise<TaskListCursorFileResult>;
}

/** Probe functions in recover mode — the lean subset recovery needs. */
export interface SessionRecoverProbes {
  worktree: () => Promise<WorktreeSyncStatusResult>;
  worktreeIdentity: () => Promise<WorktreeIdentity>;
  dirty: () => Promise<DirtyStateResult>;
  extensions: () => Promise<ExtensionsSessionInitResult>;
  config: () => Promise<ConfigSessionInitResult>;
  active: (
    identity: string | null,
    role: string | null,
  ) => Promise<ActiveSessionInitResult>;
  releaseRouting: () => Promise<ReleaseRoutingValue>;
  cohortDoc: (activeMetaPath: string) => Promise<string | null>;
  taskCursor: (taskListPath: string) => Promise<TaskListCursorFileResult>;
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
  /** Canonical identity-global user root resolved by the handler. */
  identityGlobalUserDir?: string | null;
}

export interface RunRecoverStatusOptions {
  identity: string | null;
  role: string | null;
  probes: SessionRecoverProbes;
  /** Canonical identity-global user root resolved by the handler. */
  identityGlobalUserDir?: string | null;
}

export interface RunSessionHandoffStatusOptions {
  identity: string | null;
  role: string | null;
  probes: SessionHandoffProbes;
}
