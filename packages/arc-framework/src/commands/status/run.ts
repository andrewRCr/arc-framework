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
 * Each entry point fans out independent ResultAsync probes through
 * `Promise.all`, carries typed failures through derived stages, then adapts
 * every present slot to the public {@link Probe} union at final composition.
 * The envelope itself never rejects on an ordinary probe failure.
 *
 * Identity/role are resolved in the handler and passed in as pointers; the
 * composite only short-circuits the user slot when `identity` is absent
 * (user notes are identity-scoped). `config` and `identity` are independent —
 * config settings live in arc-config.yml, identity lives in git config.
 *
 * @module
 */

import type {
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
  StatusIdentity,
  StatusResult,
  WorktreeIdentity,
} from "./types.js";
import {
  buildSessionSharedSlots,
  gatedSlot,
  locusStateSlot,
  safeProbe,
  SessionCompositionError,
  toProbe,
  userSlot,
  type SessionResult,
  type SessionStatusError,
} from "./result-composition.js";
import type { ActiveSessionInitResult } from "../active/types.js";
import { resolveCleanArmNotesVerdict } from "../user/drift.js";
import type { UserSessionInitStatusResult } from "../user/types.js";
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
import { assertLoadSetPath, resolveLoadSetManifest } from "../../lib/load-set/projection.js";
import {
  fromThrowable,
  err,
  okAsync,
  type ResultAsync,
} from "../../lib/kernel/index.js";

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
  const extensionsTask = safeProbe("extensions", () => probes.extensions());
  const configTask = safeProbe("config", () => probes.config());
  const activeTask = safeProbe("active", () => probes.active());

  const [user, extensions, config, active] = await Promise.all([
    userTask,
    extensionsTask,
    configTask,
    activeTask,
  ]);

  return {
    mode: "full",
    identity: buildIdentity(identity, role),
    user: toProbe(user),
    extensions: toProbe(extensions),
    config: toProbe(config),
    active: toProbe(active),
  };
}

/** Run the session-init-scoped composite probe — same orchestration, scoped slot shapes. */
export async function runSessionInitStatus(
  options: RunSessionInitStatusOptions,
): Promise<SessionInitProbeResult> {
  const { identity, role, probes, workingMemoryPath } = options;

  type RawUser = SessionResult<UserSessionInitStatusResult>;
  type RawErrandState = SessionResult<
    import("../../lib/session-init/errand-state.js").ErrandStateResult
  >;

  const shared = buildSessionSharedSlots({ identity, role, probes });
  const worktreeIdentityTask = safeProbe("worktreeIdentity", () => probes.worktreeIdentity());
  const baseDistanceTask = safeProbe("baseDistance", () => probes.baseDistance());
  const baseBranchSyncTask = safeProbe("baseBranchSync", () => probes.baseBranchSync());
  const extensionsTask = safeProbe("extensions", () => probes.extensions());
  const configTask = safeProbe("config", () => probes.config());
  const domainRulesTask = safeProbe("domainRules", () => probes.domainRules());
  // Retired-subdir detection rides the eager phase (no roster dependency); it
  // needs identity to resolve a user dir, so it is omitted when identity is
  // absent. `null` here means "not computed" — distinct from an empty result.
  const retiredSubdirsTask = identity === null
    ? null
    : safeProbe("retiredSubdirs", () => probes.retiredSubdirs(identity));
  // Errand-staleness sweep rides the same eager / identity-gated phase: its
  // source is identity-scoped, so it is omitted when identity is absent.
  const errandSweepTask = identity === null
    ? null
    : safeProbe("errandSweep", () => probes.errandSweep(identity));
  // Inbox-state probe rides the same eager / identity-gated phase: its source
  // (`USER-INBOX.md`) is identity-scoped, so it is omitted when identity is absent.
  const inboxStateTask = identity === null
    ? null
    : safeProbe("inboxState", () => probes.inboxState(identity));
  // Partial-push-marker surface rides the same eager / identity-gated phase: the
  // sync-state ref is identity-scoped, so it is omitted when identity is absent.
  const partialPushMarkerTask = identity === null
    ? null
    : safeProbe("partialPushMarker", () => probes.partialPushMarker(identity));
  const compactionAdvisoryProbe = probes.compactionAdvisory;
  const compactionAdvisoryTask = identity === null
    || compactionAdvisoryProbe === undefined
    ? null
    : safeProbe("compactionAdvisory", () => compactionAdvisoryProbe(identity));

  const [
    locusState, user, worktree, dirty, active, releaseRouting,
    worktreeIdentitySlot, baseDistance, baseBranchSync, extensions, config, domainRules,
    retiredSubdirs, errandSweep, inboxState, partialPushMarker, compactionAdvisory,
  ] = await Promise.all([
    shared.locusState,
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
    compactionAdvisoryTask,
  ]);

  // Worktree identity is non-critical and always-on: a failed probe degrades
  // to "primary" (surface nothing) rather than masking the whole worktree slot.
  const worktreeIdentity: WorktreeIdentity = worktreeIdentitySlot.isOk()
    ? worktreeIdentitySlot.value
    : { kind: "primary" };

  // Cross-channel qualifier: when the notes-clean verdict is true only
  // because local HEAD is behind origin, attach the qualifier to user
  // so downstream consumers can reason about reachability.
  const qualifiedUser: RawUser =
    user.isOk() && user.value.state === "clean" &&
      worktree.isOk() && worktree.value.state === "remote-ahead"
      ? user.map((value) => ({ ...value, qualifier: "clean-at-current-head" as const }))
      : user;

  // Patch-equal supersession refinement — only meaningful when the worktree has
  // diverged from its upstream and the branch is resolvable. A single bounded
  // `git cherry` over the local-ahead set; skipped on every non-diverged resume,
  // so the common path pays nothing. `null` when not diverged or the read failed.
  const supersessionSlot =
    worktree.isOk() && worktree.value.state === "diverged" && worktree.value.branch !== null
      ? await safeProbe("supersession", () => probes.supersession(worktree.value.branch as string))
      : undefined;
  const supersession = supersessionSlot?.isOk() ? supersessionSlot.value : null;

  const recommendations = composeSessionInitRecommendations({
    worktree,
    user: qualifiedUser,
    dirty,
    config,
    supersession,
  });

  const enrichedWorktree = worktree.map((value) => ({
        ...value,
        recommendedAction: recommendations.worktree.recommendedAction,
        recommendedPromptText: recommendations.worktree.recommendedPromptText,
        identity: worktreeIdentity,
        supersession,
      } satisfies SessionInitWorktreeValue));

  // Current-locus husk/transient provenance is a linked + branchless
  // refinement, not a new sync state. Ordinary branched resumes skip the read.
  const currentHuskSlot =
    worktreeIdentity.kind === "linked" && worktree.isOk() && worktree.value.branch === null
      ? await safeProbe("currentHusk", () => probes.currentHusk(worktreeIdentity.path))
      : undefined;
  const currentHusk = currentHuskSlot?.isOk() ? currentHuskSlot : undefined;

  // Base-distance enrichment mirrors the worktree slot's shape. Its
  // recommendation is an independent advisory (behind-base reconcile offer),
  // composed straight from the slot — orthogonal to the worktree+notes pull
  // recommendations and their combined prompt.
  const baseDistanceRec = inferBaseDistance(baseDistance.isOk() ? baseDistance.value : null);
  const enrichedBaseDistance = baseDistance.map((value) => ({
        ...value,
        recommendedAction: baseDistanceRec.recommendedAction,
        recommendedPromptText: baseDistanceRec.recommendedPromptText,
      } satisfies SessionInitBaseDistanceValue));

  // Base-branch-sync enrichment — the config-gated fast-forward freshen offer.
  // Reads `session.init_pull.base` and the probe's base checkout locus. Current
  // worktree dirt does not gate this channel (fetch-into-ref only moves a
  // non-checked-out ref); a base checked out elsewhere degrades pull/prompt
  // to a primary-aware surface.
  const baseBranchPolicy = normalizeBaseBranchSyncPolicy(
    config.isOk() ? config.value.settings["session.init_pull.base"] : "prompt",
  );
  const baseBranchSyncRec = inferBaseBranchSync(
    baseBranchSync.isOk() ? baseBranchSync.value : null,
    baseBranchPolicy,
  );
  const enrichedBaseBranchSync = baseBranchSync.map((value) => ({
        ...value,
        recommendedAction: baseBranchSyncRec.recommendedAction,
        recommendedPromptText: baseBranchSyncRec.recommendedPromptText,
      } satisfies SessionInitBaseBranchSyncValue));

  // Retired-subdir slot enrichment — the reconcile rides the notes-LOAD channel
  // (`arc user load`), so it reads the `session.init_load.notes` policy and the
  // dirty-tree flag (a dirty tree degrades `always` to an offer). The
  // recommendation drives session-init's broadened notes-load dispatch, which
  // fires one `arc user load` when `loadNeeded` OR retired candidates are
  // present — so a current-notes machine still reconciles its orphan subdirs.
  const notesLoadPolicy = normalizeNotesLoadPolicy(
    config.isOk() ? config.value.settings["session.init_load.notes"] : "prompt",
  );
  const retiredSubdirsRec = inferRetiredSubdirs(
    retiredSubdirs !== null && retiredSubdirs.isOk() ? retiredSubdirs.value : null,
    notesLoadPolicy,
    dirty.isOk() ? dirty.value : { state: "clean", fileCount: 0 },
  );
  const enrichedRetiredSubdirs =
    retiredSubdirs === null
      ? undefined
      : retiredSubdirs.map((value) => ({
        ...value,
        recommendedAction: retiredSubdirsRec.recommendedAction,
        recommendedPromptText: retiredSubdirsRec.recommendedPromptText,
      } satisfies SessionInitRetiredSubdirsValue));

  // Resolve the clean-arm notes/disk drift verdict (D3) here, where the active
  // WU name is known — the raw `notesDrift` signal can't decide the safe
  // auto-load sub-case (the active WU's missing SESSION-NOTES) without it. The
  // verdict finalizes `loadNeeded` (the safe sub-case upgrades it) and any
  // advisory `notesDriftSurface`.
  const activeWuName = active.isOk() ? metaWorkUnitNameFromActive(active.value.path) : null;
  const notesVerdict = qualifiedUser.isOk() && qualifiedUser.value.notesDrift
    ? resolveCleanArmNotesVerdict({ ...qualifiedUser.value.notesDrift, activeWuName })
    : null;

  const enrichedUser = qualifiedUser.map((value) => ({
        ...value,
        recommendedAction: recommendations.user.recommendedAction,
        recommendedPromptText: recommendations.user.recommendedPromptText,
        ...(notesVerdict ? { loadNeeded: notesVerdict.loadNeeded } : {}),
        ...(notesVerdict?.driftSurface ? { notesDriftSurface: notesVerdict.driftSurface } : {}),
      } satisfies SessionInitUserValue));

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
    (worktree.isOk() && worktree.value.state === "branch-gone") ||
    (active.isOk() && active.value.resolution === "none") ||
    worktreeIdentity.kind === "primary";
  const rosterTask = gatedSlot(rosterGated, "roster", () => probes.roster());
  const cleanupRosterTask = gatedSlot(
    worktreeIdentity.kind === "linked",
    "cleanupRoster",
    () => (probes.cleanupRoster ?? probes.roster)(),
  );
  const roster = rosterTask === undefined ? undefined : await rosterTask;
  const cleanupRoster = cleanupRosterTask === undefined ? undefined : await cleanupRosterTask;

  // Roster consumers — recovery, sweep, errand-state — thread the resolved
  // roster value (and other narrowed slots) as input, so they stay as inline
  // conditional stages rather than gated slots: a gated slot owns only the
  // fire-or-omit gate, not the cross-slot data threading these need.

  // Branch-gone recovery — a gated consumer of the roster, narrower than the
  // roster gate (branch-gone only). It consumes the roster resolved just above,
  // so one roster computation feeds every consumer and recovery fires only when
  // the worktree is branch-gone and the roster resolved.
  const recovery =
    worktree.isOk() && worktree.value.state === "branch-gone" && roster?.isOk()
      ? await safeProbe("recovery", () => probes.recovery(roster.value, worktree.value.branch))
      : undefined;

  // Residue sweep — consumes the public roster in the primary worktree and the
  // private cleanup-only roster in a linked worktree. The private value never
  // reaches recovery, completion state, or the returned envelope.
  const sweepRoster = worktreeIdentity.kind === "primary" ? roster : cleanupRoster;
  const sweep =
    sweepRoster?.isOk()
      ? await safeProbe("sweep", () => probes.sweep(sweepRoster.value, worktreeIdentity))
      : undefined;

  // Orphan-branch sweep — local branch hygiene from primary or identity-known
  // linked sessions. It consumes no roster and performs no network operation.
  const orphanBranchSweep =
    (worktreeIdentity.kind === "primary" || identity !== null)
      ? await safeProbe("orphanBranchSweep", () => probes.orphanBranchSweep(worktreeIdentity))
      : undefined;
  const errandState: RawErrandState | undefined =
    worktree.isOk() && active.isOk()
      ? await safeProbe("errandState", () => probes.errandState({
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
    roster?.isOk()
      ? await safeProbe("workUnitState", () =>
        probes.workUnitState({
          roster: roster.value,
          includeSharpening: active.isOk() && active.value.resolution === "none",
        }))
      : undefined;

  // Materializable-WU oracle slot — the discovery surface for cross-machine
  // pickup. Expressed through the same `gatedSlot` affordance as the roster:
  // fires the oracle's bounded network slice ONLY on the no-active-WU arm, so
  // the resume path pays zero oracle cost.
  const materializableWorkUnitsTask = gatedSlot(
    active.isOk() && active.value.resolution === "none",
    "materializableWorkUnits",
    () => probes.materializableWorkUnits(),
  );
  const materializableWorkUnits = materializableWorkUnitsTask === undefined
    ? undefined
    : await materializableWorkUnitsTask;

  // Plate-balance signal — the in-flight `Class` composition over the roster
  // slice, read by next-work discovery to surface the one-line advisory when a
  // Heavy/Novel stream is already in flight. Gated to the no-active-WU arm
  // (where discovery runs) and computed synchronously from the resolved roster;
  // omitted when nothing is in flight.
  const inFlightComposition =
    active.isOk() && active.value.resolution === "none" && roster?.isOk()
      ? (resolveInFlightComposition(roster.value.entries) ?? undefined)
      : undefined;

  // Cohort-doc resolution — when a single active WU resolved, locate its
  // coordinating `cohort-<leaf>.md` so context-load can read it. Probe failures
  // propagate through loadSet because recovery must not silently drop context.
  const cohortDoc = await resolveCohortDoc(active, probes.cohortDoc);
  const cohortDocPath = cohortDoc.isOk() ? cohortDoc.value : null;
  const loadSet = active.andThen((activeValue) => loadSetFromState({
      identity,
      activeWorkUnit: activeWuName,
      metaPath: activeValue.path,
      sessionType: activeValue.sessionType,
      planningStage: activeValue.planningStage,
      taskListPath: activeValue.taskListPath ?? null,
      activeExtensions: extensions.isOk() ? extensions.value.active : [],
      cohortDocPath,
      cohortDoc,
      workingMemoryPath: workingMemoryPath ?? null,
    }));
  const taskListPath = active.isOk() ? (active.value.taskListPath ?? null) : null;
  const taskCursor =
    active.isOk() && taskListPath !== null && taskListPathIsLoadSetSafe(taskListPath)
      ? await safeProbe("taskCursor", () => probes.taskCursor(taskListPath))
      : undefined;

  return {
    mode: "session-init",
    identity: buildIdentity(identity, role),
    locusState: toProbe(locusState),
    user: toProbe(enrichedUser),
    worktree: toProbe(enrichedWorktree),
    baseDistance: toProbe(enrichedBaseDistance),
    baseBranchSync: toProbe(enrichedBaseBranchSync),
    dirty: toProbe(dirty),
    extensions: toProbe(extensions),
    config: toProbe(config),
    active: toProbe(active),
    domainRules: toProbe(domainRules),
    releaseRouting: toProbe(releaseRouting),
    ...(roster !== undefined ? { roster: toProbe(roster) } : {}),
    ...(recovery !== undefined ? { recovery: toProbe(recovery) } : {}),
    ...(sweep !== undefined ? { sweep: toProbe(sweep) } : {}),
    ...(currentHusk !== undefined ? { currentHusk: toProbe(currentHusk) } : {}),
    ...(orphanBranchSweep !== undefined ? { orphanBranchSweep: toProbe(orphanBranchSweep) } : {}),
    ...(enrichedRetiredSubdirs !== undefined
      ? { retiredSubdirs: toProbe(enrichedRetiredSubdirs) }
      : {}),
    ...(errandSweep !== null ? { errandSweep: toProbe(errandSweep) } : {}),
    ...(errandState !== undefined ? { errandState: toProbe(errandState) } : {}),
    ...(workUnitState !== undefined ? { workUnitState: toProbe(workUnitState) } : {}),
    ...(materializableWorkUnits !== undefined
      ? { materializableWorkUnits: toProbe(materializableWorkUnits) }
      : {}),
    ...(inboxState !== null ? { inboxState: toProbe(inboxState) } : {}),
    ...(partialPushMarker !== null ? { partialPushMarker: toProbe(partialPushMarker) } : {}),
    ...(compactionAdvisory !== null ? { compactionAdvisory: toProbe(compactionAdvisory) } : {}),
    ...(inFlightComposition !== undefined ? { inFlightComposition } : {}),
    ...(cohortDocPath !== null ? { cohortDocPath } : {}),
    loadSet: toProbe(loadSet),
    ...(taskCursor !== undefined ? { taskCursor: toProbe(taskCursor) } : {}),
    recommendedCombinedPrompt: recommendations.recommendedCombinedPrompt,
  };
}

/** Run the lean recover-mode composite probe. */
export async function runRecoverStatus(
  options: RunRecoverStatusOptions,
): Promise<SessionRecoverProbeResult> {
  const { identity, role, probes, workingMemoryPath } = options;

  const worktreeTask = safeProbe("worktree", () => probes.worktree());
  const locusStateTask = locusStateSlot(identity, (id) => probes.locusState(id));
  const worktreeIdentityTask = safeProbe("worktreeIdentity", () => probes.worktreeIdentity());
  const dirtyTask = safeProbe("dirty", () => probes.dirty());
  const extensionsTask = safeProbe("extensions", () => probes.extensions());
  const configTask = safeProbe("config", () => probes.config());
  const activeTask = safeProbe("active", () => probes.active(identity, role));
  const releaseRoutingTask = safeProbe("releaseRouting", () => probes.releaseRouting());

  const [
    locusState,
    worktree,
    worktreeIdentitySlot,
    dirty,
    extensions,
    config,
    active,
    releaseRouting,
  ] = await Promise.all([
    locusStateTask,
    worktreeTask,
    worktreeIdentityTask,
    dirtyTask,
    extensionsTask,
    configTask,
    activeTask,
    releaseRoutingTask,
  ]);

  const worktreeIdentity: WorktreeIdentity = worktreeIdentitySlot.isOk()
    ? worktreeIdentitySlot.value
    : { kind: "primary" };
  const enrichedWorktree = worktree.map((value) => ({
        ...value,
        identity: worktreeIdentity,
      } satisfies SessionRecoverWorktreeValue));

  const cohortDoc = await resolveCohortDoc(active, probes.cohortDoc);
  const cohortDocPath = cohortDoc.isOk() ? cohortDoc.value : null;
  const activeWuName = active.isOk() ? metaWorkUnitNameFromActive(active.value.path) : null;
  const loadSet = active.andThen((activeValue) => loadSetFromState({
      identity,
      activeWorkUnit: activeWuName,
      metaPath: activeValue.path,
      sessionType: activeValue.sessionType,
      planningStage: activeValue.planningStage,
      taskListPath: activeValue.taskListPath ?? null,
      activeExtensions: extensions.isOk() ? extensions.value.active : [],
      cohortDocPath,
      cohortDoc,
      workingMemoryPath: workingMemoryPath ?? null,
    }));
  const taskListPath = active.isOk() ? (active.value.taskListPath ?? null) : null;
  const taskCursor =
    active.isOk() && taskListPath !== null && taskListPathIsLoadSetSafe(taskListPath)
      ? await safeProbe("taskCursor", () => probes.taskCursor(taskListPath))
      : undefined;

  return {
    mode: "recover",
    identity: buildIdentity(identity, role),
    locusState: toProbe(locusState),
    worktree: toProbe(enrichedWorktree),
    dirty: toProbe(dirty),
    extensions: toProbe(extensions),
    config: toProbe(config),
    active: toProbe(active),
    releaseRouting: toProbe(releaseRouting),
    ...(cohortDocPath !== null ? { cohortDocPath } : {}),
    loadSet: toProbe(loadSet),
    ...(taskCursor !== undefined ? { taskCursor: toProbe(taskCursor) } : {}),
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

function resolveCohortDoc(
  active: SessionResult<ActiveSessionInitResult>,
  probe: (metaPath: string) => Promise<string | null>,
): ResultAsync<string | null, SessionStatusError> {
  if (!active.isOk() || active.value.resolution !== "single" || active.value.path === null) {
    return okAsync(null);
  }
  const metaPath = active.value.path;
  return safeProbe("cohortDocPath", () => probe(metaPath));
}

function loadSetFromState(options: {
  identity: string | null;
  activeWorkUnit: string | null;
  metaPath: string | null;
  sessionType: ActiveSessionInitResult["sessionType"];
  planningStage: ActiveSessionInitResult["planningStage"];
  taskListPath: string | null;
  activeExtensions: readonly string[];
  cohortDocPath: string | null;
  cohortDoc: SessionResult<string | null>;
  workingMemoryPath: string | null;
}): SessionResult<ReturnType<typeof resolveLoadSetManifest>> {
  if (!options.cohortDoc.isOk()) return err(options.cohortDoc.error);
  const resolve = fromThrowable(
    () => resolveLoadSetManifest({
      identity: options.identity,
      activeWorkUnit: options.activeWorkUnit,
      metaPath: options.metaPath,
      sessionType: options.sessionType,
      planningStage: options.planningStage,
      taskListPath: options.taskListPath,
      activeExtensions: options.activeExtensions,
      cohortDocPath: options.cohortDocPath,
      workingMemoryPath: options.workingMemoryPath,
    }),
    (cause) => new SessionCompositionError("resolve-load-set", "loadSet", cause),
  );
  return resolve();
}

function taskListPathIsLoadSetSafe(taskListPath: string): boolean {
  try {
    assertLoadSetPath(taskListPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compose recommendations from resolved probe slots. Falls back to skip-
 * everything when any required input failed to resolve — the workflow
 * surfaces probe-failure diagnostics separately, so recommendations stay
 * neutral rather than guessing.
 */
function composeSessionInitRecommendations(slots: {
  worktree: SessionResult<import("../../lib/git/worktree-sync.js").WorktreeSyncStatusResult>;
  user: SessionResult<import("../user/types.js").UserSessionInitStatusResult>;
  dirty: SessionResult<DirtyStateResult>;
  config: SessionResult<import("../config/types.js").ConfigSessionInitResult>;
  supersession: import("../../lib/git/supersession.js").SupersessionResult | null;
}): ReturnType<typeof inferSessionInitRecommendations> {
  if (!slots.worktree.isOk() || !slots.dirty.isOk() || !slots.config.isOk()) {
    return {
      worktree: { recommendedAction: "skip", recommendedPromptText: "" },
      user: { recommendedAction: "skip", recommendedPromptText: "" },
      recommendedCombinedPrompt: null,
    };
  }
  const settings = slots.config.value.settings;
  return inferSessionInitRecommendations({
    worktree: slots.worktree.value,
    user: slots.user.isOk() ? slots.user.value : null,
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
  const syncInterlockTask = safeProbe("syncInterlock", () => probes.syncInterlock());
  const headTask = safeProbe("head", () => probes.head());
  const pushabilityTask = safeProbe("pushability", () => probes.pushability());
  const restateCandidatesTask = safeProbe("restateCandidates", () => probes.restateCandidates());
  const inboxStateTask = identity === null
    ? null
    : safeProbe("inboxState", () => probes.inboxState(identity));

  const [
    locusState, user, worktree, dirty, active, releaseRouting,
    syncInterlock, head, pushability, restateCandidates, inboxState,
  ] = await Promise.all([
    shared.locusState,
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

  const branch = worktree.isOk() ? worktree.value.branch : null;
  const handoffActiveWuName = active.isOk() ? metaWorkUnitNameFromActive(active.value.path) : null;
  const handoffNotesVerdict = user.isOk() && user.value.notesDrift
    ? resolveCleanArmNotesVerdict({ ...user.value.notesDrift, activeWuName: handoffActiveWuName })
    : null;
  const enrichedUser = user.map((value) => ({
        ...value,
        ...(handoffNotesVerdict ? { loadNeeded: handoffNotesVerdict.loadNeeded } : {}),
        ...(handoffNotesVerdict?.driftSurface ? { notesDriftSurface: handoffNotesVerdict.driftSurface } : {}),
      } satisfies SessionUserValue));

  const recommendedSummaryLine = worktree.isOk()
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
    locusState: toProbe(locusState),
    branch,
    dirty: toProbe(dirty),
    worktree: toProbe(worktree),
    user: toProbe(enrichedUser),
    syncInterlock: toProbe(syncInterlock),
    active: toProbe(active),
    head: toProbe(head),
    pushability: toProbe(pushability),
    restateCandidates: toProbe(restateCandidates),
    releaseRouting: toProbe(releaseRouting),
    ...(inboxState !== null ? { inboxState: toProbe(inboxState) } : {}),
    recommendedSummaryLine,
  };
}
