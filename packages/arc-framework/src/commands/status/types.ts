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
import { z } from "zod";

import type {
  CompactionSeedWriteStatusSchema,
  StatusIdentitySchema,
} from "./schema.js";

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
import type {
  WorktreeSnapshotAnalysisResult,
} from "../../lib/git/worktree-sync.js";
import type {
  BaseDistanceSnapshotAnalysisResult,
  BaseDistanceStatusResult,
} from "../../lib/git/base-distance.js";
import type {
  BaseBranchSnapshotAnalysisResult,
} from "../../lib/git/base-branch-sync.js";
import type {
  SupersessionResult,
  SupersessionSnapshotAnalysisResult,
} from "../../lib/git/supersession.js";
import type { WorktreeRosterResult } from "../../lib/git/worktree-roster.js";
import type { WorktreeIdentity } from "../../lib/git/worktree-identity.js";
import type {
  CascadeResolution,
  SessionInitRecoveryValue,
} from "../../lib/session-init/branch-gone-cascade.js";
import type { StaleWorktreeSweepResult } from "../../lib/session-init/stale-worktree-sweep.js";
import type { CurrentHuskAdvisory } from "../../lib/session-init/current-husk-advisory.js";
import type { OrphanBranchSweepResult } from "../../lib/session-init/orphan-branch-sweep.js";
import type { RetiredSubdirDetectionResult } from "../../lib/session-init/retired-subdir-detection.js";
import type { ErrandStalenessSweepResult } from "../../lib/session-init/errand-staleness-sweep.js";
import type { ErrandStateResult } from "../../lib/session-init/errand-state.js";
import type { PartialPushMarkerSurfaceResult } from "../../lib/session-init/partial-push-marker-surface.js";
import type { NotesCompactionSessionAdvisoryResult } from "../../lib/session-init/notes-compaction-advisory.js";
import type { DeliveryPositionView } from "../../lib/session-init/delivery-position.js";
import type {
  MaterializableWorkUnitDiscoveryResult,
} from "../../lib/session-init/materializable-work-units.js";
import type { WorkUnitStateResult } from "../../lib/session-init/work-unit-state.js";
import type { InboxStateResult } from "../../lib/session-init/inbox-state.js";
import type { ClassComposition } from "../../lib/status/class-composition.js";
import type { RestateCandidatesResult } from "../../lib/handoff/restate-candidates.js";
import type { HandoffLocusPlan } from "../../lib/handoff/locus-plan.js";
import type { ReleaseRoutingValue } from "../../lib/release/routing.js";
import type { RecommendedAction } from "../../lib/session-init/recommended-action.js";
import type { LoadSetManifest } from "../../lib/load-set/types.js";
import type { TaskListCursorFileResult } from "../../lib/task-list/file-cursor.js";
import type { DerivedLocusFrame } from "../../lib/locus/derived-reader.js";
import type { LocusSessionGuidance } from "../../lib/locus/session-guidance.js";
import type { RecoveryLocusFrame } from "../../lib/recover/locus-context.js";
import type { CurrentWuReconcileSessionResult } from "../../lib/session-init/current-wu-reconcile.js";
import type { UserReferenceReconcileSessionResult } from "../../lib/user-reference-reconcile.js";
import type { SessionRemoteContext } from "../../handlers/status-remote-context.js";

export type { RecommendedAction, WorktreeIdentity };

/**
 * Worktree slot in the session-init envelope. Extends the raw probe result
 * with a precomputed action + prompt text the workflow renders directly.
 */
export type SessionInitWorktreeValue = (
  WorktreeSnapshotAnalysisResult
) & {
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
};

/**
 * A base-distance reading that resolved before any snapshot evidence was consulted.
 *
 * Bounded to exactly those arms: unbounded, the intersection also admitted
 * `remote-unavailable` with `not-applicable`, which the envelope rule refuses — so a
 * probe could satisfy the type and still fail the contract at runtime. Named once
 * because the probe signature and the envelope value state the same contract, and
 * two copies of it drifted from the schema.
 */
export type BaseDistanceNotApplicableResult = BaseDistanceStatusResult & {
  state: "skipped" | "no-remote" | "detached-head";
  remoteEvidence: "not-applicable";
};

/**
 * Base-distance slot in the session-init envelope. Extends the raw probe
 * result (HEAD vs `origin/<base>`) with the same precomputed action + prompt
 * text pair as the worktree slot, so the workflow renders a behind-base
 * reconcile offer without re-deriving it from state.
 */
export type SessionInitBaseDistanceValue = (
  BaseDistanceSnapshotAnalysisResult | BaseDistanceNotApplicableResult
) & {
  recommendedAction: RecommendedAction;
  /** Composed orientation text when `recommendedAction === "surface"`; empty string otherwise. */
  recommendedPromptText: string;
};

/**
 * Base-branch-sync slot in the session-init envelope. Extends the raw probe
 * result (local `<base>` vs `origin/<base>`, plus `checkout` locus) with the
 * config-gated action + prompt pair: `pull` / `prompt` drive the fast-forward
 * freshen only when the base is not checked out; `surface` covers a stale base
 * under `manual`, a base checked out elsewhere (primary-aware), a diverged
 * base, and the arms carrying an explicit `refreshRemedy`, which offer the
 * guarded verb rather than the weaker fetch-into-ref; `skip` a current base or
 * when this worktree holds the base. The comparison itself runs against the
 * request's shared passive remote evidence and performs no fetch of its own.
 */
export type SessionInitBaseBranchSyncValue = BaseBranchSnapshotAnalysisResult & {
  recommendedAction: RecommendedAction;
  /** Composed offer text when `recommendedAction ∈ {prompt, surface}`; empty string otherwise. */
  recommendedPromptText: string;
};

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
export type StatusIdentity = z.infer<typeof StatusIdentitySchema>;

/**
 * Per-probe failure reason.
 *
 * - `identity-missing` — user probe short-circuited because `arc.identity`
 *   was absent. Other probes do not use identity and never emit this kind.
 * - `runtime` — probe threw (e.g., missing extensions directory on a partial
 *   install). `message` is the `Error.message` or stringified value.
 */
export const ProbeErrorSchema = z.strictObject({
  kind: z.enum(["identity-missing", "runtime"]),
  message: z.string(),
});

/** Per-probe failure reason derived from the wire schema authority. */
export type ProbeError = z.infer<typeof ProbeErrorSchema>;

/**
 * Build the flat success/error schema for one independently fallible slot.
 *
 * @param valueSchema - Runtime contract for the success value
 * @returns Strict discriminated probe schema preserving the success value
 */
export function probe<ValueSchema extends z.ZodType>(valueSchema: ValueSchema) {
  return z.discriminatedUnion("ok", [
    z.strictObject({ ok: z.literal(true), value: valueSchema }),
    z.strictObject({ ok: z.literal(false), error: ProbeErrorSchema }),
  ]);
}

/** Discriminated union for a probe slot — success or typed error. */
export type Probe<Value> = z.infer<ReturnType<typeof probe<z.ZodType<Value>>>>;

/** JSON-safe summary of a `--write-compaction-seed` attempt. */
export type CompactionSeedWriteStatus = z.infer<typeof CompactionSeedWriteStatusSchema>;

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
  /** Worktree-derived entering-checkout frame selected for session-init consumers. */
  derivedLocusState: Probe<DerivedLocusFrame>;
  /** CLI-precomposed narration derived from the same locus probe. */
  locusGuidance: LocusSessionGuidance;
  user: Probe<SessionInitUserValue>;
  worktree: Probe<SessionInitWorktreeValue>;
  /**
   * Shared advisory base-drift analysis against a freshly fetched immutable
   * base OID. Always present (eager, non-gated); the recommendation pair passes
   * the analyzer-owned register through for reconcile and skips otherwise.
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
   * Read-only reconcile facts for the single active work unit. Present exactly
   * on the single-WU arm; the workflow renders the precomposed guidance and
   * never applies tracked edits during session entry.
   */
  currentWuReconcile?: Probe<CurrentWuReconcileSessionResult>;
  /** Exact owning-WU delivery orientation; null is authoritative unbound silence. */
  deliveryPosition?: Probe<DeliveryPositionView | null>;
  /** Read-only identity-global reference facts for the single active WU. */
  userReferenceReconcile?: Probe<UserReferenceReconcileSessionResult>;
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
   * `surface` / `main-fallback` / `pending`) plus CLI-composed action and
   * narration for the workflow recovery arm. Absent on every other path.
   */
  recovery?: Probe<SessionInitRecoveryValue>;
  /**
   * Pre-computed residue sweep. Primary sessions consume the public roster;
   * linked sessions consume a private cleanup-only roster and exclude their
   * exact current path. Absent when the applicable roster fails.
   */
  sweep?: Probe<StaleWorktreeSweepResult>;
  /**
   * Derived orientation for a linked branchless checkout that is an exact,
   * locally completed stamped WU husk. This advisory is derived independently
   * of worktree sync state from the current checkout marker and Git topology.
   * Omission means the locus is inapplicable — an ordinary branched or primary path.
   * An eligible linked branchless locus always publishes the slot, so a degraded probe
   * appears as `{ ok: false }` there rather than as an absent slot.
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
   * execute-or-demote. Advisory only. Present when identity resolved on the
   * primary worktree; omitted when identity is absent or the session is a linked
   * worktree.
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
  materializableWorkUnits?: Probe<MaterializableWorkUnitDiscoveryResult>;
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
   * Pre-computed inbox-state probe — routable and execute-bound entry counts in
   * `USER-INBOX`, plus a `housekeepNeeded` flag, so the Orient arm offers
   * housekeep from a machine-resolved signal rather than an agent re-scan. Present
   * when identity resolved on the primary worktree; omitted when identity is
   * absent or the session is a linked worktree.
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
   * marker. Present when identity resolved on the primary worktree and the
   * optional probe is supplied; omitted when identity is absent, the session is
   * a linked worktree, or the probe is not supplied. Workflow
   * renders it as offer-only guidance and never auto-runs compaction.
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
export type SessionRecoverWorktreeValue = WorktreeSnapshotAnalysisResult & {
  /** Which physical worktree the recovered session occupies. */
  identity: WorktreeIdentity;
};

/** Lean recover-mode composite result — `--recover` consumer shape. */
export interface SessionRecoverProbeResult {
  mode: "recover";
  identity: StatusIdentity;
  /** Exact entering-checkout projection used for recovery selection. */
  derivedLocusState: Probe<DerivedLocusFrame>;
  /** CLI-precomposed narration derived from the same entering frame. */
  locusGuidance: LocusSessionGuidance;
  /** Reader-owned subject frame and governing workflow selected from the entering checkout. */
  recoveryFrame: Probe<RecoveryLocusFrame>;
  worktree: Probe<SessionRecoverWorktreeValue>;
  dirty: Probe<DirtyStateResult>;
  extensions: Probe<ExtensionsSessionInitResult>;
  config: Probe<ConfigSessionInitResult>;
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
 * Resolved handoff surface paths — write/read locations for SESSION-NOTES and
 * WORKING-MEMORY. Absolute when present; `null` when identity is absent or
 * (for `sessionNotes`) no single active work unit is resolved. The agent must
 * not re-derive these from identity + slug conventions: the two surfaces resolve
 * by opposite rules (checkout-local vs primary-worktree resolver-backed).
 */
export interface HandoffPathSet {
  /** Checkout-local SESSION-NOTES absolute path for the active WU, or `null`. */
  sessionNotes: string | null;
  /** Resolver-backed WORKING-MEMORY absolute path (primary worktree), or `null`. */
  workingMemory: string | null;
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
 *
 * `pathSet` carries the absolute SESSION-NOTES and WORKING-MEMORY paths so the
 * handoff workflow never reconstructs them from conventions (those two surfaces
 * resolve by opposite rules under linked-worktree operation).
 */
export interface SessionHandoffResult {
  mode: "session-handoff";
  identity: StatusIdentity;
  /** Entering-checkout projection that exclusively selects the handoff subject. */
  derivedLocusState: Probe<DerivedLocusFrame>;
  /** CLI-precomposed narration derived from the entering-checkout projection. */
  locusGuidance: LocusSessionGuidance;
  /** Exact subject action derived from the same entering-checkout frame. */
  handoffLocus: Probe<HandoffLocusPlan>;
  /**
   * Current branch name from the worktree probe; `null` on detached HEAD or
   * when the worktree probe failed.
   */
  branch: string | null;
  dirty: Probe<DirtyStateResult>;
  worktree: Probe<WorktreeSnapshotAnalysisResult>;
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
   * Pre-computed inbox-state probe — routable and execute-bound entry counts in
   * `USER-INBOX`, plus a `housekeepNeeded` flag, so the between-WUs handoff
   * branch can offer housekeep from a machine-resolved signal rather than an agent re-scan.
   * Present whenever identity resolved; omitted only when identity is absent.
   */
  inboxState?: Probe<InboxStateResult>;
  /**
   * Resolved absolute paths for SESSION-NOTES (checkout-local) and WORKING-MEMORY
   * (primary-worktree resolver-backed). Probe-shaped so surface-resolution
   * failures stay inside the composite envelope (`ok: false`) rather than
   * aborting `arc status --session-handoff --json`. On success, fields are
   * `null` when identity is absent or no active WU anchors SESSION-NOTES.
   * Stable from probe-1 (depends only on identity + active resolution).
   */
  pathSet: Probe<HandoffPathSet>;
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

/** Probe functions in session-init mode — bound to cwd and any required I/O. */
export interface SessionInitProbes {
  user: (identity: string) => Promise<UserSessionInitStatusResult>;
  dirty: () => Promise<DirtyStateResult>;
  releaseRouting: () => Promise<ReleaseRoutingValue>;
  /** Resolve the entering-checkout frame with the exact active extension set. */
  derivedLocusState: (
    identity: string,
    activeExtensions: readonly string[],
  ) => Promise<DerivedLocusFrame>;
  /** Acquire the immutable request-scoped code-repository remote context. */
  remoteContext: () => Promise<SessionRemoteContext>;
  /** Analyze worktree sync from the supplied request context. */
  worktree: (
    context: SessionRemoteContext,
  ) => Promise<WorktreeSnapshotAnalysisResult>;
  /** Inspect one resolved active WU through the shared read-only reconcile planner. */
  currentWuReconcile: (
    input: { slug: string; metaPath: string },
  ) => Promise<CurrentWuReconcileSessionResult>;
  /** Inspect only the exact owning work unit's canonical delivery binding. */
  deliveryPosition?: (
    context: SessionRemoteContext,
    input: { workUnitId: string },
  ) => Promise<DeliveryPositionView | null>;
  /** Inspect permitted current-user surfaces against protection-aware base evidence. */
  userReferenceReconcile: (
    context: SessionRemoteContext,
    input: { slug: string },
  ) => Promise<UserReferenceReconcileSessionResult>;
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
  currentHusk: (
    context: SessionRemoteContext,
    worktreePath: string,
  ) => Promise<CurrentHuskAdvisory | null>;
  /**
   * Shared base-drift analyzer in advisory mode. Session-init-only (not a
   * shared slot); the handler binds the semantic adapters, resolved base, and
   * advisory remote-sync policy.
   */
  baseDistance: (
    context: SessionRemoteContext,
  ) => Promise<BaseDistanceSnapshotAnalysisResult | BaseDistanceNotApplicableResult>;
  /**
   * Base-branch-sync probe — local `<base>` vs `origin/<base>`. Session-init-only
   * (a between-WU resume is where a silently-stale local base matters). The
   * handler binds the resolved `branch.base` and remote-sync flag, mirroring the
   * base-distance probe.
   */
  baseBranchSync: (
    context: SessionRemoteContext,
  ) => Promise<BaseBranchSnapshotAnalysisResult>;
  /**
   * Patch-equal supersession detector — `git cherry` over the local-ahead set,
   * receiving the current branch from the orchestrator. Called ONLY when the
   * worktree slot resolved to `diverged` (a bounded read on the one state where
   * supersession is meaningful), so the common resume path pays nothing.
   */
  supersession: (
    context: SessionRemoteContext,
    branch: string,
  ) => Promise<SupersessionResult | SupersessionSnapshotAnalysisResult>;
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
    context: SessionRemoteContext,
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
    context: SessionRemoteContext,
    roster: WorktreeRosterResult,
    worktreeIdentity: WorktreeIdentity,
  ) => Promise<StaleWorktreeSweepResult>;
  /**
   * Orphan-branch sweep resolver. Receives the session's worktree identity; the
   * handler binds the base branch, errand-branch exclusions, and git executor.
   * Called ONLY in the primary worktree — it enumerates gone-upstream local
   * branches itself (no roster dependency).
   */
  orphanBranchSweep: (
    context: SessionRemoteContext,
    worktreeIdentity: WorktreeIdentity,
  ) => Promise<OrphanBranchSweepResult>;
  /**
   * Retired-subdir detection resolver. Receives the resolved identity and reads
   * `user/{identity}/` + `.arc/completed/` (cheap) plus a gated recent-notes
   * read. Fired in the eager phase whenever identity resolved; read-only.
   */
  retiredSubdirs: (
    context: SessionRemoteContext,
    identity: string,
  ) => Promise<RetiredSubdirDetectionResult>;
  /**
   * Errand-staleness sweep resolver. Receives the resolved identity; the handler
   * resolves the candidate entries and the `inbox.remind_after_days` threshold,
   * then ages them. Fired only on the primary worktree when identity resolved;
   * omitted on linked worktrees. Advisory, read-only.
   */
  errandSweep: (identity: string) => Promise<ErrandStalenessSweepResult>;
  /**
   * Errand-state resolver. The orchestrator supplies the current branch,
   * backing-meta signal, the Orient/discovery gate, and whether to read the
   * once-per-day reminder nudge marker (primary only). The handler binds the
   * shared in-flight oracle (errand discovery derives from it) and config.
   */
  errandState: (context: SessionRemoteContext, input: {
    currentBranch: string | null;
    hasBackingMeta: boolean;
    includeDiscovery: boolean;
    includeNudge: boolean;
  }) => Promise<ErrandStateResult>;
  /**
   * Materializable-WU oracle slice. Fires the oracle's bounded network read
   * (remote membership → in-flight derivation → remote-only owned filter) to
   * surface the operator's cross-machine materialize candidates. The handler
   * binds the git executor, identity, and team-mode filter; the orchestrator
   * calls this ONLY on the no-active-WU arm so the resume path pays no oracle
   * cost. An unreachable remote degrades to an empty candidate list.
   */
  materializableWorkUnits: (
    context: SessionRemoteContext,
  ) => Promise<MaterializableWorkUnitDiscoveryResult>;
  /**
   * Work-unit completion-sweep resolver. Receives the already-resolved roster
   * and a sharpening gate from the orchestrator; the handler binds the git
   * executor, identity, staleness threshold, and — when `includeSharpening` —
   * the `gh`-backed PR source. Called ONLY when the roster resolved (primary /
   * no-active-WU / branch-gone); sharpening is requested only on the
   * no-active-WU arm.
   */
  workUnitState: (context: SessionRemoteContext, input: {
    roster: WorktreeRosterResult;
    includeSharpening: boolean;
  }) => Promise<WorkUnitStateResult>;
  /**
   * Inbox-state resolver. Receives the resolved identity; the handler reads
   * `user/{identity}/USER-INBOX.md` and counts its routable and execute-bound entries. Fired only
   * on the primary worktree when identity resolved; omitted on linked
   * worktrees. Advisory, read-only.
   */
  inboxState: (identity: string) => Promise<InboxStateResult>;
  /**
   * Partial-push-marker surface resolver. Receives the resolved identity; the
   * handler binds the git executor and reference time, reads the local
   * sync-state ref, and selects the live, non-expired markers. Fired in the
   * eager phase whenever identity resolved; read-only, network-free.
   */
  partialPushMarker: (identity: string) => Promise<PartialPushMarkerSurfaceResult>;
  /** User-notes compaction advisory resolver. Fired on the primary worktree when identity resolved. */
  compactionAdvisory?: (identity: string) => Promise<NotesCompactionSessionAdvisoryResult>;
}

/** Probe functions in recover mode — the lean subset recovery needs. */
export interface SessionRecoverProbes {
  /** Resolve the entering checkout with the exact active extension set. */
  derivedLocusState: (
    identity: string,
    activeExtensions: readonly string[],
  ) => Promise<DerivedLocusFrame>;
  worktree: () => Promise<WorktreeSnapshotAnalysisResult>;
  worktreeIdentity: () => Promise<WorktreeIdentity>;
  dirty: () => Promise<DirtyStateResult>;
  extensions: () => Promise<ExtensionsSessionInitResult>;
  config: () => Promise<ConfigSessionInitResult>;
  releaseRouting: () => Promise<ReleaseRoutingValue>;
}

/** Probe functions in session-handoff mode — bound to cwd and any required I/O. */
export interface SessionHandoffProbes {
  user: (identity: string) => Promise<UserSessionInitStatusResult>;
  worktree: () => Promise<WorktreeSnapshotAnalysisResult>;
  dirty: () => Promise<DirtyStateResult>;
  releaseRouting: () => Promise<ReleaseRoutingValue>;
  /** Resolve the entering checkout with the exact active extension set. */
  derivedLocusState: (
    identity: string,
    activeExtensions: readonly string[],
  ) => Promise<DerivedLocusFrame>;
  /** Resolve active extensions before composing the derived WU projection. */
  extensions: () => Promise<ExtensionsSessionInitResult>;
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
  /** Exact identity-global working-memory path resolved by the handler. */
  workingMemoryPath?: string | null;
}

export interface RunRecoverStatusOptions {
  identity: string | null;
  role: string | null;
  probes: SessionRecoverProbes;
  /** Exact identity-global working-memory path resolved by the handler. */
  workingMemoryPath?: string | null;
}

/**
 * User-surface paths needed to compose the handoff `pathSet` slot.
 * Resolved inside the composite under `safeProbe("pathSet", …)`.
 */
export interface HandoffSurfacePaths {
  /** Exact identity-global WORKING-MEMORY absolute path. */
  workingMemoryPath: string;
  /** Checkout-local SESSION-NOTES absolute path for a WU slug. */
  sessionNotesPath: (workUnitName: string) => string;
}

/**
 * Session-handoff orchestrator options — identity and surface resolution are
 * coupled so a non-null identity cannot silently omit the resolver (which would
 * otherwise report a successful `pathSet` of null identity-global paths).
 *
 * - `identity: null` — no surfaces; `resolveHandoffSurfaces` is unavailable.
 * - `identity: string` — `resolveHandoffSurfaces` is required; the composite
 *   invokes it under `safeProbe("pathSet", …)`.
 */
export type RunSessionHandoffStatusOptions =
  | {
    identity: null;
    role: string | null;
    probes: SessionHandoffProbes;
    resolveHandoffSurfaces?: never;
  }
  | {
    identity: string;
    role: string | null;
    probes: SessionHandoffProbes;
    /**
     * Resolve identity-global handoff surfaces. Invoked inside the composite
     * under `safeProbe("pathSet", …)` so rejections become `pathSet` probe
     * errors instead of aborting the envelope.
     */
    resolveHandoffSurfaces: () => Promise<HandoffSurfacePaths>;
  };
