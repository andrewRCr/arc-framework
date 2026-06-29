/**
 * Composite `arc status` orchestrators.
 *
 * Two entry points:
 *
 * - {@link runStatus} — full-mode composite (default rendering).
 * - {@link runSessionInitStatus} — session-init-scoped composite consumed
 *   by the harness. Replaces Batch 1's four probe invocations + two
 *   `git config` reads with a single CLI call.
 *
 * Both fan out via `Promise.all` over the four probe slots (user, extensions,
 * config, active) with per-slot rejection wrapped into a typed {@link Probe}
 * error. The composite itself never rejects on a probe failure — the session-
 * init workflow decides how to respond based on the result shape.
 *
 * Identity/role are resolved in the handler and passed in as pointers; the
 * composite only short-circuits the user slot when `identity` is absent
 * (user notes are identity-scoped). `config` and `identity` are independent —
 * config settings live in arc-config.yml, identity lives in git config.
 *
 * @module
 */

import type {
  ProbeError,
  RunRecoverStatusOptions,
  RunSessionHandoffStatusOptions,
  RunSessionInitStatusOptions,
  RunStatusOptions,
  SessionRecoverProbeResult,
  SessionRecoverWorktreeValue,
  SessionHandoffResult,
  SessionInitBaseBranchSyncValue,
  SessionInitBaseDistanceValue,
  SessionInitProbeResult,
  SessionInitRetiredSubdirsValue,
  SessionInitUserValue,
  SessionInitWorktreeValue,
  SessionUserValue,
  SessionSharedProbes,
  StatusIdentity,
  StatusResult,
  WorktreeIdentity,
} from "./types.js";
import type { ActiveSessionInitResult } from "../active/types.js";
import { resolveCleanArmNotesVerdict } from "../user/drift.js";
import type { UserSessionInitStatusResult } from "../user/types.js";
import type { WorktreeSyncStatusResult } from "../../lib/git/worktree-sync.js";
import type { ReleaseRoutingValue } from "../../lib/release/routing.js";
import {
  inferBaseBranchSync,
  inferBaseDistance,
  inferRetiredSubdirs,
  inferSessionInitRecommendations,
  type BaseBranchSyncPullPolicy,
  type NotesLoadPolicy,
  type NotesPullPolicy,
  type WorktreePullPolicy,
} from "../../lib/session-init/recommended-action.js";
import { inferRecommendedSummaryLine } from "../../lib/handoff/recommended-summary-line.js";
import { resolveInFlightComposition } from "../../lib/session-init/in-flight-composition.js";
import type { DirtyStateResult } from "../../lib/git/dirty-state.js";
import { resolveLoadSetManifest } from "../../lib/load-set/projection.js";

const IDENTITY_MISSING_MESSAGE =
  "User probe skipped: `arc.identity` is not configured in git config.";

/**
 * Error-branch shape of `Probe<T>`. Split out so the helpers below avoid
 * a generic parameter whose only role is to unify with the ok branch —
 * otherwise TypeScript infers `T = unknown` in the `.then(ok, fromRejection)`
 * chain and the composite result types reject the promise assignment.
 */
type ProbeErrorSlot = { ok: false; error: ProbeError };

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

function fromRejection(err: unknown): ProbeErrorSlot {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, error: { kind: "runtime", message } };
}

/**
 * Wrap a probe invocation so a synchronous throw during invocation or
 * parameter validation is caught and converted into a resolved Probe error,
 * preserving the documented "envelope itself never rejects" contract.
 *
 * `Promise.resolve().then(probe)` evaluates `probe()` inside a microtask:
 * synchronous throws become rejections of the resulting promise, which
 * `fromRejection` then captures.
 */
function safeProbe<T>(
  probe: () => Promise<T>,
): Promise<{ ok: true; value: T } | ProbeErrorSlot> {
  return Promise.resolve().then(probe).then(ok, fromRejection);
}

/**
 * Gated-slot affordance over {@link safeProbe}. An expensive slot — a roster
 * scan, an oracle's network slice — runs only when its gating condition holds;
 * otherwise the probe is never invoked and the slot resolves to `undefined`
 * (omitted from the envelope). When it does fire, `safeProbe` preserves the
 * "envelope never rejects" contract: a throwing probe resolves to an error
 * slot, not a rejection.
 *
 * Generalized from the orchestrator's two real expensive slots (the in-flight
 * roster and the materializable-WU oracle) so their firing discipline is
 * expressed once. The caller owns the boolean gate — this only sequences
 * "evaluate the gate, then fire-or-omit".
 */
export function gatedSlot<T>(
  condition: boolean,
  probe: () => Promise<T>,
): Promise<{ ok: true; value: T } | ProbeErrorSlot | undefined> {
  return condition ? safeProbe(probe) : Promise.resolve(undefined);
}

function identityMissing(): ProbeErrorSlot {
  return {
    ok: false,
    error: { kind: "identity-missing", message: IDENTITY_MISSING_MESSAGE },
  };
}

/** A resolved probe slot — success value or typed error. Structurally `Probe<T>`. */
type Slot<T> = { ok: true; value: T } | ProbeErrorSlot;

/**
 * User-slot primitive: the identity-missing short-circuit shared by all three
 * entry points. When `identity` is absent the user probe is never invoked and
 * the slot resolves to an `identity-missing` error; otherwise `safeProbe` wraps
 * the invocation, preserving the "envelope never rejects" contract. Generic over
 * the probe's result type so full mode (`UserStatusResult`) and the session
 * modes (`UserSessionInitStatusResult`) share one declaration.
 */
export function userSlot<T>(
  identity: string | null,
  probe: (identity: string) => Promise<T>,
): Promise<Slot<T>> {
  return identity === null
    ? Promise.resolve(identityMissing())
    : safeProbe(() => probe(identity));
}

/** The five probe slots shared by both session-scoped entry points. */
interface SessionSharedSlots {
  user: Promise<Slot<UserSessionInitStatusResult>>;
  worktree: Promise<Slot<WorktreeSyncStatusResult>>;
  dirty: Promise<Slot<DirtyStateResult>>;
  active: Promise<Slot<ActiveSessionInitResult>>;
  releaseRouting: Promise<Slot<ReleaseRoutingValue>>;
}

/**
 * Declare the slots common to `session-init` and `session-handoff` once. Both
 * orchestrators below compose their envelope from this single source plus their
 * own mode-specific slots, rather than re-wiring user / worktree / dirty /
 * active / releaseRouting independently. Each slot's probe fires eagerly (the
 * `safeProbe` task starts on call), so the caller folding these into its
 * `Promise.all` keeps the fan-out concurrent.
 */
export function buildSessionSharedSlots(opts: {
  identity: string | null;
  role: string | null;
  probes: SessionSharedProbes;
}): SessionSharedSlots {
  const { identity, role, probes } = opts;
  return {
    user: userSlot(identity, (id) => probes.user(id)),
    worktree: safeProbe(() => probes.worktree()),
    dirty: safeProbe(() => probes.dirty()),
    active: safeProbe(() => probes.active(identity, role)),
    releaseRouting: safeProbe(() => probes.releaseRouting()),
  };
}

function buildIdentity(identity: string | null, role: string | null): StatusIdentity {
  return { identity, role };
}

/**
 * Run the full-mode composite probe.
 *
 * Parallel orchestration via `Promise.all` over four probe slots. Identity is
 * read in the handler (`git config arc.identity` / `arc.role`) and passed as
 * pointers; when `identity` is `null` the user slot resolves to an
 * `identity-missing` {@link Probe} error without invoking the user probe.
 */
export async function runStatus(options: RunStatusOptions): Promise<StatusResult> {
  const { identity, role, probes } = options;

  const userTask = userSlot(identity, (id) => probes.user(id));
  const extensionsTask = safeProbe(() => probes.extensions());
  const configTask = safeProbe(() => probes.config());
  const activeTask = safeProbe(() => probes.active());

  const [user, extensions, config, active] = await Promise.all([
    userTask,
    extensionsTask,
    configTask,
    activeTask,
  ]);

  return {
    mode: "full",
    identity: buildIdentity(identity, role),
    user,
    extensions,
    config,
    active,
  };
}

/** Run the session-init-scoped composite probe — same orchestration, scoped slot shapes. */
export async function runSessionInitStatus(
  options: RunSessionInitStatusOptions,
): Promise<SessionInitProbeResult> {
  const { identity, role, probes, recoveryHarness = null } = options;

  type RawUser = Slot<UserSessionInitStatusResult>;
  type RawRetired =
    | { ok: true; value: import("../../lib/session-init/retired-subdir-detection.js").RetiredSubdirDetectionResult }
    | ProbeErrorSlot;
  type RawErrandSweep =
    | { ok: true; value: import("../../lib/session-init/errand-staleness-sweep.js").ErrandStalenessSweepResult }
    | ProbeErrorSlot;
  type RawErrandState =
    | { ok: true; value: import("../../lib/session-init/errand-state.js").ErrandStateResult }
    | ProbeErrorSlot;
  type RawInboxState =
    | { ok: true; value: import("../../lib/session-init/inbox-state.js").InboxStateResult }
    | ProbeErrorSlot;
  type RawPartialPushMarker =
    | { ok: true; value: import("../../lib/session-init/partial-push-marker-surface.js").PartialPushMarkerSurfaceResult }
    | ProbeErrorSlot;

  const shared = buildSessionSharedSlots({ identity, role, probes });
  const worktreeIdentityTask = safeProbe(() => probes.worktreeIdentity());
  const baseDistanceTask = safeProbe(() => probes.baseDistance());
  const baseBranchSyncTask = safeProbe(() => probes.baseBranchSync());
  const extensionsTask = safeProbe(() => probes.extensions());
  const configTask = safeProbe(() => probes.config());
  const domainRulesTask = safeProbe(() => probes.domainRules());
  // Retired-subdir detection rides the eager phase (no roster dependency); it
  // needs identity to resolve a user dir, so it is omitted when identity is
  // absent. `null` here means "not computed" — distinct from an empty result.
  const retiredSubdirsTask: Promise<RawRetired | null> = identity === null
    ? Promise.resolve(null)
    : safeProbe(() => probes.retiredSubdirs(identity));
  // Errand-staleness sweep rides the same eager / identity-gated phase: its
  // source is identity-scoped, so it is omitted when identity is absent.
  const errandSweepTask: Promise<RawErrandSweep | null> = identity === null
    ? Promise.resolve(null)
    : safeProbe(() => probes.errandSweep(identity));
  // Inbox-state probe rides the same eager / identity-gated phase: its source
  // (`USER-INBOX.md`) is identity-scoped, so it is omitted when identity is absent.
  const inboxStateTask: Promise<RawInboxState | null> = identity === null
    ? Promise.resolve(null)
    : safeProbe(() => probes.inboxState(identity));
  // Partial-push-marker surface rides the same eager / identity-gated phase: the
  // sync-state ref is identity-scoped, so it is omitted when identity is absent.
  const partialPushMarkerTask: Promise<RawPartialPushMarker | null> = identity === null
    ? Promise.resolve(null)
    : safeProbe(() => probes.partialPushMarker(identity));

  const [
    user, worktree, dirty, active, releaseRouting,
    worktreeIdentitySlot, baseDistance, baseBranchSync, extensions, config, domainRules,
    retiredSubdirs, errandSweep, inboxState, partialPushMarker,
  ] = await Promise.all([
    shared.user,
    shared.worktree,
    shared.dirty,
    shared.active,
    shared.releaseRouting,
    worktreeIdentityTask,
    baseDistanceTask,
    baseBranchSyncTask,
    extensionsTask,
    configTask,
    domainRulesTask,
    retiredSubdirsTask,
    errandSweepTask,
    inboxStateTask,
    partialPushMarkerTask,
  ]);

  // Worktree identity is non-critical and always-on: a failed probe degrades
  // to "primary" (surface nothing) rather than masking the whole worktree slot.
  const worktreeIdentity: WorktreeIdentity = worktreeIdentitySlot.ok
    ? worktreeIdentitySlot.value
    : { kind: "primary" };

  // Cross-channel qualifier: when the notes-clean verdict is true only
  // because local HEAD is behind origin, attach the qualifier to user
  // so downstream consumers can reason about reachability.
  const qualifiedUser: RawUser =
    user.ok && user.value.state === "clean" &&
      worktree.ok && worktree.value.state === "remote-ahead"
      ? { ...user, value: { ...user.value, qualifier: "clean-at-current-head" as const } }
      : user;

  // Patch-equal supersession refinement — only meaningful when the worktree has
  // diverged from its upstream and the branch is resolvable. A single bounded
  // `git cherry` over the local-ahead set; skipped on every non-diverged resume,
  // so the common path pays nothing. `null` when not diverged or the read failed.
  const supersessionSlot =
    worktree.ok && worktree.value.state === "diverged" && worktree.value.branch !== null
      ? await safeProbe(() => probes.supersession(worktree.value.branch as string))
      : undefined;
  const supersession = supersessionSlot?.ok ? supersessionSlot.value : null;

  const recommendations = composeSessionInitRecommendations({
    worktree,
    user: qualifiedUser,
    dirty,
    config,
    supersession,
  });

  const enrichedWorktree: SessionInitProbeResult["worktree"] = worktree.ok
    ? {
      ok: true,
      value: {
        ...worktree.value,
        recommendedAction: recommendations.worktree.recommendedAction,
        recommendedPromptText: recommendations.worktree.recommendedPromptText,
        identity: worktreeIdentity,
        supersession,
      } satisfies SessionInitWorktreeValue,
    }
    : worktree;

  // Base-distance enrichment mirrors the worktree slot's shape. Its
  // recommendation is an independent advisory (behind-base reconcile offer),
  // composed straight from the slot — orthogonal to the worktree+notes pull
  // recommendations and their combined prompt.
  const baseDistanceRec = inferBaseDistance(baseDistance.ok ? baseDistance.value : null);
  const enrichedBaseDistance: SessionInitProbeResult["baseDistance"] = baseDistance.ok
    ? {
      ok: true,
      value: {
        ...baseDistance.value,
        recommendedAction: baseDistanceRec.recommendedAction,
        recommendedPromptText: baseDistanceRec.recommendedPromptText,
      } satisfies SessionInitBaseDistanceValue,
    }
    : baseDistance;

  // Base-branch-sync enrichment — the config-gated fast-forward freshen offer.
  // Unlike base-distance it reads the `session.init_pull.base` policy and the
  // dirty-tree flag (a dirty tree refuses the freshen), so the recommendation
  // is composed from the slot, that policy, and the dirty slot.
  const baseBranchPolicy = normalizeBaseBranchSyncPolicy(
    config.ok ? config.value.settings["session.init_pull.base"] : "prompt",
  );
  const baseBranchSyncRec = inferBaseBranchSync(
    baseBranchSync.ok ? baseBranchSync.value : null,
    baseBranchPolicy,
    dirty.ok ? dirty.value : { state: "clean", fileCount: 0 },
  );
  const enrichedBaseBranchSync: SessionInitProbeResult["baseBranchSync"] = baseBranchSync.ok
    ? {
      ok: true,
      value: {
        ...baseBranchSync.value,
        recommendedAction: baseBranchSyncRec.recommendedAction,
        recommendedPromptText: baseBranchSyncRec.recommendedPromptText,
      } satisfies SessionInitBaseBranchSyncValue,
    }
    : baseBranchSync;

  // Retired-subdir slot enrichment — the reconcile rides the notes-LOAD channel
  // (`arc user load`), so it reads the `session.init_load.notes` policy and the
  // dirty-tree flag (a dirty tree degrades `always` to an offer). The
  // recommendation drives session-init's broadened notes-load dispatch, which
  // fires one `arc user load` when `loadNeeded` OR retired candidates are
  // present — so a current-notes machine still reconciles its orphan subdirs.
  const notesLoadPolicy = normalizeNotesLoadPolicy(
    config.ok ? config.value.settings["session.init_load.notes"] : "prompt",
  );
  const retiredSubdirsRec = inferRetiredSubdirs(
    retiredSubdirs !== null && retiredSubdirs.ok ? retiredSubdirs.value : null,
    notesLoadPolicy,
    dirty.ok ? dirty.value : { state: "clean", fileCount: 0 },
  );
  const enrichedRetiredSubdirs: SessionInitProbeResult["retiredSubdirs"] | undefined =
    retiredSubdirs === null
      ? undefined
      : retiredSubdirs.ok
        ? {
          ok: true,
          value: {
            ...retiredSubdirs.value,
            recommendedAction: retiredSubdirsRec.recommendedAction,
            recommendedPromptText: retiredSubdirsRec.recommendedPromptText,
          } satisfies SessionInitRetiredSubdirsValue,
        }
        : retiredSubdirs;

  // Resolve the clean-arm notes/disk drift verdict (D3) here, where the active
  // WU name is known — the raw `notesDrift` signal can't decide the safe
  // auto-load sub-case (the active WU's missing SESSION-NOTES) without it. The
  // verdict finalizes `loadNeeded` (the safe sub-case upgrades it) and any
  // advisory `notesDriftSurface`.
  const activeWuName = active.ok ? metaWorkUnitNameFromActive(active.value.path) : null;
  const notesVerdict = qualifiedUser.ok && qualifiedUser.value.notesDrift
    ? resolveCleanArmNotesVerdict({ ...qualifiedUser.value.notesDrift, activeWuName })
    : null;

  const enrichedUser: SessionInitProbeResult["user"] = qualifiedUser.ok
    ? {
      ok: true,
      value: {
        ...qualifiedUser.value,
        recommendedAction: recommendations.user.recommendedAction,
        recommendedPromptText: recommendations.user.recommendedPromptText,
        ...(notesVerdict ? { loadNeeded: notesVerdict.loadNeeded } : {}),
        ...(notesVerdict?.driftSurface ? { notesDriftSurface: notesVerdict.driftSurface } : {}),
      } satisfies SessionInitUserValue,
    }
    : qualifiedUser;

  // Two-stage orchestration seam. The eager `Promise.all` above is the first
  // stage. The expensive slots below are the second: the in-flight roster and
  // the materializable-WU oracle both express through the `gatedSlot` affordance
  // — fire the probe only when the gate holds, omit the slot otherwise, with
  // `safeProbe`'s "envelope never rejects" contract preserved either way. Their
  // gating signals (worktree state, active resolution, worktree identity) are
  // produced by sibling slots in the fan-out above, so they can only resolve in
  // a second stage. On the linked-worktree resume path both gates are false, so
  // neither probe runs and resume latency is unchanged.
  //
  // The in-flight roster gates on the branch-gone, no-WU, and primary-worktree
  // arms; the primary arm fires it for the stale-worktree sweep — a main session
  // recurs often enough to bound the lingering window.
  const rosterGated =
    (worktree.ok && worktree.value.state === "branch-gone") ||
    (active.ok && active.value.resolution === "none") ||
    worktreeIdentity.kind === "primary";
  const roster = await gatedSlot(rosterGated, () => probes.roster());

  // Roster consumers — recovery, sweep, errand-state — thread the resolved
  // roster value (and other narrowed slots) as input, so they stay as inline
  // conditional stages rather than gated slots: a gated slot owns only the
  // fire-or-omit gate, not the cross-slot data threading these need.

  // Branch-gone recovery — a gated consumer of the roster, narrower than the
  // roster gate (branch-gone only). It consumes the roster resolved just above,
  // so one roster computation feeds every consumer and recovery fires only when
  // the worktree is branch-gone and the roster resolved.
  const recovery =
    worktree.ok && worktree.value.state === "branch-gone" && roster?.ok
      ? await safeProbe(() => probes.recovery(roster.value, worktree.value.branch))
      : undefined;

  // Stale-worktree sweep — a second roster consumer, gated to the primary (main)
  // worktree. Cross-references the roster against `.arc/completed/` and resolves
  // each lingering shipped-WU worktree's cleanup disposition. Fires only when
  // the session is in the primary worktree and the roster resolved.
  const sweep =
    worktreeIdentity.kind === "primary" && roster?.ok
      ? await safeProbe(() => probes.sweep(roster.value, worktreeIdentity))
      : undefined;

  // `plan/`-orphan sweep — a primary-worktree branch-hygiene check. Unlike the
  // stale-worktree sweep it consumes no roster: it enumerates gone-upstream
  // `plan/` branches itself, so it gates on worktree identity alone.
  const planOrphanSweep =
    worktreeIdentity.kind === "primary"
      ? await safeProbe(() => probes.planOrphanSweep(worktreeIdentity))
      : undefined;
  const errandState: RawErrandState | undefined =
    worktree.ok && active.ok
      ? await safeProbe(() => probes.errandState({
        currentBranch: worktree.value.branch,
        hasBackingMeta: active.value.resolution === "single",
        includeDiscovery: active.value.resolution === "none",
      }))
      : undefined;

  // Work-unit completion sweep — a roster consumer surfacing the operator's
  // owned in-flight (`Integrating`) WUs across the completion tail. Fires on
  // every arm where the roster resolved (primary / no-WU / branch-gone),
  // mirroring the stale-worktree sweep; the presence tier is network-free. The
  // mergeable-sharpening tier's live PR query is requested ONLY on the
  // no-active-WU arm — the same bounded network slice the materialize oracle uses.
  const workUnitState =
    roster?.ok
      ? await safeProbe(() =>
        probes.workUnitState({
          roster: roster.value,
          includeSharpening: active.ok && active.value.resolution === "none",
        }))
      : undefined;

  // Materializable-WU oracle slot — the discovery surface for cross-machine
  // pickup. Expressed through the same `gatedSlot` affordance as the roster:
  // fires the oracle's bounded network slice ONLY on the no-active-WU arm, so
  // the resume path pays zero oracle cost.
  const materializableWorkUnits = await gatedSlot(
    active.ok && active.value.resolution === "none",
    () => probes.materializableWorkUnits(),
  );

  // Plate-balance signal — the in-flight `Class` composition over the roster
  // slice, read by next-work discovery to surface the one-line advisory when a
  // Heavy/Novel stream is already in flight. Gated to the no-active-WU arm
  // (where discovery runs) and computed synchronously from the resolved roster;
  // omitted when nothing is in flight.
  const inFlightComposition =
    active.ok && active.value.resolution === "none" && roster?.ok
      ? (resolveInFlightComposition(roster.value.entries) ?? undefined)
      : undefined;

  // Cohort-doc resolution — when a single active WU resolved, locate its
  // coordinating `cohort-<leaf>.md` so context-load can read it. Totalized to
  // null on any miss; the call is guarded so the envelope never rejects.
  const cohortDocPath =
    active.ok && active.value.resolution === "single" && active.value.path !== null
      ? await probes.cohortDoc(active.value.path).catch(() => null)
      : null;
  const loadSet = ok(resolveLoadSetManifest({
    identity,
    activeWorkUnit: activeWuName,
    metaPath: active.ok ? active.value.path : null,
    sessionType: active.ok ? active.value.sessionType : null,
    planningStage: active.ok ? active.value.planningStage : null,
    taskListPath: active.ok ? (active.value.taskListPath ?? null) : null,
    activeExtensions: extensions.ok ? extensions.value.active : [],
    cohortDocPath,
    harness: recoveryHarness,
  }));
  const taskListPath = active.ok ? (active.value.taskListPath ?? null) : null;
  const taskCursor =
    taskListPath !== null
      ? await safeProbe(() => probes.taskCursor(taskListPath))
      : undefined;

  return {
    mode: "session-init",
    identity: buildIdentity(identity, role),
    user: enrichedUser,
    worktree: enrichedWorktree,
    baseDistance: enrichedBaseDistance,
    baseBranchSync: enrichedBaseBranchSync,
    dirty,
    extensions,
    config,
    active,
    domainRules,
    releaseRouting,
    ...(roster !== undefined ? { roster } : {}),
    ...(recovery !== undefined ? { recovery } : {}),
    ...(sweep !== undefined ? { sweep } : {}),
    ...(planOrphanSweep !== undefined ? { planOrphanSweep } : {}),
    ...(enrichedRetiredSubdirs !== undefined ? { retiredSubdirs: enrichedRetiredSubdirs } : {}),
    ...(errandSweep !== null ? { errandSweep } : {}),
    ...(errandState !== undefined ? { errandState } : {}),
    ...(workUnitState !== undefined ? { workUnitState } : {}),
    ...(materializableWorkUnits !== undefined ? { materializableWorkUnits } : {}),
    ...(inboxState !== null ? { inboxState } : {}),
    ...(partialPushMarker !== null ? { partialPushMarker } : {}),
    ...(inFlightComposition !== undefined ? { inFlightComposition } : {}),
    ...(cohortDocPath !== null ? { cohortDocPath } : {}),
    loadSet,
    ...(taskCursor !== undefined ? { taskCursor } : {}),
    recommendedCombinedPrompt: recommendations.recommendedCombinedPrompt,
  };
}

/** Run the lean recover-mode composite probe. */
export async function runRecoverStatus(
  options: RunRecoverStatusOptions,
): Promise<SessionRecoverProbeResult> {
  const { identity, role, probes, recoveryHarness = null } = options;

  const worktreeTask = safeProbe(() => probes.worktree());
  const worktreeIdentityTask = safeProbe(() => probes.worktreeIdentity());
  const dirtyTask = safeProbe(() => probes.dirty());
  const extensionsTask = safeProbe(() => probes.extensions());
  const configTask = safeProbe(() => probes.config());
  const activeTask = safeProbe(() => probes.active(identity, role));
  const releaseRoutingTask = safeProbe(() => probes.releaseRouting());

  const [
    worktree,
    worktreeIdentitySlot,
    dirty,
    extensions,
    config,
    active,
    releaseRouting,
  ] = await Promise.all([
    worktreeTask,
    worktreeIdentityTask,
    dirtyTask,
    extensionsTask,
    configTask,
    activeTask,
    releaseRoutingTask,
  ]);

  const worktreeIdentity: WorktreeIdentity = worktreeIdentitySlot.ok
    ? worktreeIdentitySlot.value
    : { kind: "primary" };
  const enrichedWorktree: SessionRecoverProbeResult["worktree"] = worktree.ok
    ? {
      ok: true,
      value: {
        ...worktree.value,
        identity: worktreeIdentity,
      } satisfies SessionRecoverWorktreeValue,
    }
    : worktree;

  const cohortDocPath =
    active.ok && active.value.resolution === "single" && active.value.path !== null
      ? await probes.cohortDoc(active.value.path).catch(() => null)
      : null;
  const activeWuName = active.ok ? metaWorkUnitNameFromActive(active.value.path) : null;
  const loadSet = ok(resolveLoadSetManifest({
    identity,
    activeWorkUnit: activeWuName,
    metaPath: active.ok ? active.value.path : null,
    sessionType: active.ok ? active.value.sessionType : null,
    planningStage: active.ok ? active.value.planningStage : null,
    taskListPath: active.ok ? (active.value.taskListPath ?? null) : null,
    activeExtensions: extensions.ok ? extensions.value.active : [],
    cohortDocPath,
    harness: recoveryHarness,
  }));
  const taskListPath = active.ok ? (active.value.taskListPath ?? null) : null;
  const taskCursor =
    taskListPath !== null
      ? await safeProbe(() => probes.taskCursor(taskListPath))
      : undefined;

  return {
    mode: "recover",
    identity: buildIdentity(identity, role),
    worktree: enrichedWorktree,
    dirty,
    extensions,
    config,
    active,
    releaseRouting,
    ...(cohortDocPath !== null ? { cohortDocPath } : {}),
    loadSet,
    ...(taskCursor !== undefined ? { taskCursor } : {}),
  };
}

/**
 * The active work unit's name from its meta path (`…/meta-<name>.md`), or
 * `null` when no single active meta resolved. Keys the clean-arm notes/disk
 * safe-load sub-case to the active WU's `SESSION-NOTES.md`.
 */
function metaWorkUnitNameFromActive(path: string | null): string | null {
  if (path === null) return null;
  const match = /(?:^|\/)meta-(.+)\.md$/u.exec(path);
  return match?.[1] ?? null;
}

/**
 * Compose recommendations from resolved probe slots. Falls back to skip-
 * everything when any required input failed to resolve — the workflow
 * surfaces probe-failure diagnostics separately, so recommendations stay
 * neutral rather than guessing.
 */
function composeSessionInitRecommendations(slots: {
  worktree: { ok: true; value: import("../../lib/git/worktree-sync.js").WorktreeSyncStatusResult } | ProbeErrorSlot;
  user: { ok: true; value: import("../user/types.js").UserSessionInitStatusResult } | ProbeErrorSlot;
  dirty: { ok: true; value: DirtyStateResult } | ProbeErrorSlot;
  config: { ok: true; value: import("../config/types.js").ConfigSessionInitResult } | ProbeErrorSlot;
  supersession: import("../../lib/git/supersession.js").SupersessionResult | null;
}): ReturnType<typeof inferSessionInitRecommendations> {
  if (!slots.worktree.ok || !slots.dirty.ok || !slots.config.ok) {
    return {
      worktree: { recommendedAction: "skip", recommendedPromptText: "" },
      user: { recommendedAction: "skip", recommendedPromptText: "" },
      recommendedCombinedPrompt: null,
    };
  }
  const settings = slots.config.value.settings;
  return inferSessionInitRecommendations({
    worktree: slots.worktree.value,
    user: slots.user.ok ? slots.user.value : null,
    worktreePullPolicy: normalizeWorktreePolicy(settings["session.init_pull.worktree"]),
    notesPullPolicy: normalizeNotesPolicy(settings["session.init_pull.notes"]),
    dirty: slots.dirty.value,
    supersession: slots.supersession,
  });
}

function normalizeWorktreePolicy(raw: string): WorktreePullPolicy {
  return raw === "manual" ? "manual" : "prompt";
}

function normalizeNotesPolicy(raw: string): NotesPullPolicy {
  if (raw === "manual") return "manual";
  if (raw === "always") return "always";
  return "prompt";
}

function normalizeBaseBranchSyncPolicy(raw: string): BaseBranchSyncPullPolicy {
  if (raw === "manual") return "manual";
  if (raw === "always") return "always";
  return "prompt";
}

function normalizeNotesLoadPolicy(raw: string): NotesLoadPolicy {
  if (raw === "manual") return "manual";
  if (raw === "always") return "always";
  return "prompt";
}

/**
 * Run the session-handoff composite probe.
 *
 * Self-contained envelope for the arc-handoff workflow. Fans out the active
 * slots in parallel; per-slot failures wrap into `Probe` errors so the
 * envelope itself never rejects. Identity is resolved in the handler and
 * passed in as pointers; when `identity` is `null` the user (notes-sync)
 * slot short-circuits without invoking its probe.
 */
export async function runSessionHandoffStatus(
  options: RunSessionHandoffStatusOptions,
): Promise<SessionHandoffResult> {
  const { identity, role, probes } = options;

  const shared = buildSessionSharedSlots({ identity, role, probes });
  const syncInterlockTask = safeProbe(() => probes.syncInterlock());
  const headTask = safeProbe(() => probes.head());
  const pushabilityTask = safeProbe(() => probes.pushability());
  const restateCandidatesTask = safeProbe(() => probes.restateCandidates());
  const inboxStateTask: Promise<SessionHandoffResult["inboxState"] | null> = identity === null
    ? Promise.resolve(null)
    : safeProbe(() => probes.inboxState(identity));

  const [
    user, worktree, dirty, active, releaseRouting,
    syncInterlock, head, pushability, restateCandidates, inboxState,
  ] = await Promise.all([
    shared.user,
    shared.worktree,
    shared.dirty,
    shared.active,
    shared.releaseRouting,
    syncInterlockTask,
    headTask,
    pushabilityTask,
    restateCandidatesTask,
    inboxStateTask,
  ]);

  const branch = worktree.ok ? worktree.value.branch : null;
  const handoffActiveWuName = active.ok ? metaWorkUnitNameFromActive(active.value.path) : null;
  const handoffNotesVerdict = user.ok && user.value.notesDrift
    ? resolveCleanArmNotesVerdict({ ...user.value.notesDrift, activeWuName: handoffActiveWuName })
    : null;
  const enrichedUser: SessionHandoffResult["user"] = user.ok
    ? {
      ok: true,
      value: {
        ...user.value,
        ...(handoffNotesVerdict ? { loadNeeded: handoffNotesVerdict.loadNeeded } : {}),
        ...(handoffNotesVerdict?.driftSurface ? { notesDriftSurface: handoffNotesVerdict.driftSurface } : {}),
      } satisfies SessionUserValue,
    }
    : user;

  const recommendedSummaryLine = worktree.ok
    ? inferRecommendedSummaryLine({
      context: "sync-skipped",
      worktreeState: worktree.value.state,
      ahead: worktree.value.ahead,
      behind: worktree.value.behind,
      branch,
      unpushedN: worktree.value.ahead,
    })
    : null;

  return {
    mode: "session-handoff",
    identity: buildIdentity(identity, role),
    branch,
    dirty,
    worktree,
    user: enrichedUser,
    syncInterlock,
    active,
    head,
    pushability,
    restateCandidates,
    releaseRouting,
    ...(inboxState !== null ? { inboxState } : {}),
    recommendedSummaryLine,
  };
}
