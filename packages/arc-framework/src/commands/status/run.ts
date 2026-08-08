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
  HandoffPathSet,
  HandoffSurfacePaths,
  Probe,
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
  buildSessionRemoteContextSlot,
  gatedSlot,
  safeProbe,
  SessionCompositionError,
  SessionIdentityMissingError,
  toProbe,
  userSlot,
  type SessionResult,
} from "./result-composition.js";
import type { ActiveSessionInitResult } from "../active/types.js";
import { resolveCleanArmNotesVerdict } from "../user/drift.js";
import type { UserSessionInitStatusResult } from "../user/types.js";
import {
  inferBaseBranchSync,
  inferBaseDistance,
  inferBranchGoneRecovery,
  inferRetiredSubdirs,
  inferSessionInitRecommendations,
  type BaseBranchSyncPullPolicy,
  type NotesLoadPolicy,
  type NotesPullPolicy,
  type WorktreePullPolicy,
} from "../../lib/session-init/recommended-action.js";
import { inferRecommendedSummaryLine } from "../../lib/handoff/recommended-summary-line.js";
import {
  deriveDerivedLocusSessionGuidance,
  deriveRecoveryLocusSessionGuidance,
} from "../../lib/locus/session-guidance.js";
import type { DerivedLocusFrame } from "../../lib/locus/derived-reader.js";
import {
  deriveHandoffLocusPlan,
  type HandoffLocusPlan,
} from "../../lib/handoff/locus-plan.js";
import { resolveInFlightComposition } from "../../lib/session-init/in-flight-composition.js";
import type { DirtyStateResult } from "../../lib/git/dirty-state.js";
import { resolveLoadSetManifest } from "../../lib/load-set/projection.js";
import type { LoadSetManifest } from "../../lib/load-set/types.js";
import { deriveRecoveryLocusContext } from "../../lib/recover/locus-context.js";
import {
  fromThrowable,
  err,
  ok,
  okAsync,
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

  const userTask = userSlot(identity, (id) => probes.user(id));
  const dirtyTask = safeProbe("dirty", () => probes.dirty());
  const releaseRoutingTask = safeProbe("releaseRouting", () => probes.releaseRouting());
  const remote = buildSessionRemoteContextSlot(probes.remoteContext);
  const worktreeTask = remote.run("worktree", (context) => probes.worktree(context));
  const worktreeIdentityTask = safeProbe("worktreeIdentity", () => probes.worktreeIdentity());
  const baseDistanceTask = remote.run("baseDistance", (context) => probes.baseDistance(context));
  const baseBranchSyncTask = remote.run(
    "baseBranchSync",
    (context) => probes.baseBranchSync(context),
  );
  const extensionsTask = safeProbe("extensions", () => probes.extensions());
  const configTask = safeProbe("config", () => probes.config());
  const domainRulesTask = safeProbe("domainRules", () => probes.domainRules());
  // Retired-subdir detection rides the eager phase (no roster dependency); it
  // needs identity to resolve a user dir, so it is omitted when identity is
  // absent. `null` here means "not computed" — distinct from an empty result.
  const retiredSubdirsTask = identity === null
    ? null
    : remote.run("retiredSubdirs", (context) => probes.retiredSubdirs(context, identity));
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
    user, worktree, dirty, releaseRouting,
    worktreeIdentitySlot, baseDistance, baseBranchSync, extensions, config, domainRules,
    retiredSubdirs, errandSweep, inboxState, partialPushMarker, compactionAdvisory,
  ] = await Promise.all([
    userTask,
    worktreeTask,
    dirtyTask,
    releaseRoutingTask,
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

  const derivedLocusState: SessionResult<DerivedLocusFrame> = identity === null
    ? err(new SessionIdentityMissingError("derivedLocusState"))
    : await safeProbe("derivedLocusState", () => probes.derivedLocusState(
        identity,
        extensions.isOk() ? extensions.value.active : [],
      ));
  const active = derivedLocusState.map(projectDerivedActiveSession);

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
      ? await remote.run(
        "supersession",
        (context) => probes.supersession(context, worktree.value.branch as string),
      )
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
  const currentHusk =
    worktreeIdentity.kind === "linked" && worktree.isOk() && worktree.value.branch === null
      ? await remote.run(
        "currentHusk",
        (context) => probes.currentHusk(context, worktreeIdentity.path),
      )
      : undefined;

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
  const activePath = active.isOk() ? active.value.path : null;
  const activeWuName = metaWorkUnitNameFromActive(activePath);
  const currentWuReconcile =
    active.isOk()
    && active.value.resolution === "single"
    && activePath !== null
    && activeWuName !== null
      ? await safeProbe("currentWuReconcile", () =>
        probes.currentWuReconcile({ slug: activeWuName, metaPath: activePath }))
      : undefined;
  const userReferenceReconcile =
    active.isOk()
    && active.value.resolution === "single"
    && activeWuName !== null
    && identity !== null
      ? await remote.run("userReferenceReconcile", (context) =>
        probes.userReferenceReconcile(context, { slug: activeWuName }))
      : undefined;
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
  // stage. The expensive slots below are the second: the in-flight roster fires
  // through the `gatedSlot` affordance, and the materializable-WU oracle fires
  // through an inline conditional over the shared remote context (`remote.run`).
  // Both express the same fire-or-omit shape — run the probe only when the gate
  // holds, omit the slot otherwise, with `safeProbe`'s "envelope never rejects"
  // contract preserved either way. Their
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
  const rawRecovery =
    worktree.isOk() && worktree.value.state === "branch-gone" && roster?.isOk()
      ? await remote.run(
        "recovery",
        (context) => probes.recovery(context, roster.value, worktree.value.branch),
      )
      : undefined;
  const recovery = rawRecovery?.map((value) => inferBranchGoneRecovery(
    value,
    dirty.isOk() ? dirty.value : { state: "dirty", fileCount: 0 },
  ));

  // Residue sweep — consumes the public roster in the primary worktree and the
  // private cleanup-only roster in a linked worktree. The private value never
  // reaches recovery, completion state, or the returned envelope.
  const sweepRoster = worktreeIdentity.kind === "primary" ? roster : cleanupRoster;
  const sweep =
    sweepRoster?.isOk()
      ? await remote.run(
        "sweep",
        (context) => probes.sweep(context, sweepRoster.value, worktreeIdentity),
      )
      : undefined;

  // Orphan-branch sweep — local branch hygiene from primary or identity-known
  // linked sessions. It consumes no roster and performs no network operation.
  const orphanBranchSweep =
    (worktreeIdentity.kind === "primary" || identity !== null)
      ? await remote.run(
        "orphanBranchSweep",
        (context) => probes.orphanBranchSweep(context, worktreeIdentity),
      )
      : undefined;
  const errandState: RawErrandState | undefined =
    worktree.isOk() && active.isOk()
      ? await remote.run("errandState", (context) => probes.errandState(context, {
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
      ? await remote.run("workUnitState", (context) =>
        probes.workUnitState(context, {
          roster: roster.value,
          includeSharpening: active.isOk() && active.value.resolution === "none",
        }))
      : undefined;

  // Materializable-WU oracle slot — the discovery surface for cross-machine
  // pickup. Declared against the shared remote context and gated inline: the
  // oracle's bounded network slice runs ONLY on the no-active-WU arm, so the
  // resume path pays zero oracle cost.
  const materializableWorkUnitsTask = active.isOk() && active.value.resolution === "none"
    ? remote.run(
      "materializableWorkUnits",
      (context) => probes.materializableWorkUnits(context),
    )
    : undefined;
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

  const derivedContext = derivedLocusState.isOk()
    ? derivedLocusState.value.active?.context ?? null
    : null;
  const cohortDocPath = derivedContext?.cohortDocPath ?? null;
  const loadSet: SessionResult<LoadSetManifest> = derivedLocusState.isErr()
    ? err(derivedLocusState.error)
    : derivedLocusState.value.active !== null
      ? ok(derivedLocusState.value.active.context.loadSet)
      : loadSetFromState({
      identity,
      activeWorkUnit: null,
      metaPath: null,
      sessionType: null,
      planningStage: null,
      taskListPath: null,
      activeExtensions: extensions.isOk() ? extensions.value.active : [],
      cohortDocPath: null,
      cohortDoc: ok(null),
      workingMemoryPath: workingMemoryPath ?? null,
    });
  const taskCursor = derivedContext?.taskCursor === null || derivedContext === null
    ? undefined
    : derivedLocusState.map(() => derivedContext.taskCursor as NonNullable<typeof derivedContext.taskCursor>);

  return {
    mode: "session-init",
    identity: buildIdentity(identity, role),
    derivedLocusState: toProbe(derivedLocusState),
    locusGuidance: deriveDerivedLocusSessionGuidance(toProbe(derivedLocusState)),
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
    ...(currentWuReconcile !== undefined ? { currentWuReconcile: toProbe(currentWuReconcile) } : {}),
    ...(userReferenceReconcile !== undefined
      ? { userReferenceReconcile: toProbe(userReferenceReconcile) }
      : {}),
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
  const worktreeIdentityTask = safeProbe("worktreeIdentity", () => probes.worktreeIdentity());
  const dirtyTask = safeProbe("dirty", () => probes.dirty());
  const extensionsTask = safeProbe("extensions", () => probes.extensions());
  const configTask = safeProbe("config", () => probes.config());
  const releaseRoutingTask = safeProbe("releaseRouting", () => probes.releaseRouting());

  const [
    worktree,
    worktreeIdentitySlot,
    dirty,
    extensions,
    config,
    releaseRouting,
  ] = await Promise.all([
    worktreeTask,
    worktreeIdentityTask,
    dirtyTask,
    extensionsTask,
    configTask,
    releaseRoutingTask,
  ]);

  const derivedLocusState: SessionResult<DerivedLocusFrame> = identity === null
    ? err(new SessionIdentityMissingError("derivedLocusState"))
    : await safeProbe("derivedLocusState", () => probes.derivedLocusState(
        identity,
        extensions.isOk() ? extensions.value.active : [],
      ));

  // Physical checkout identity remains an independent informational slot; the
  // derived frame already selected the exact entering checkout.
  const enrichedWorktree = worktree.andThen((value) =>
    worktreeIdentitySlot.map((identityValue) => ({
      ...value,
      identity: identityValue,
    } satisfies SessionRecoverWorktreeValue)));

  const deriveContext = fromThrowable(
    (state: DerivedLocusFrame) => deriveRecoveryLocusContext({
      state,
      identity,
      workingMemoryPath: workingMemoryPath ?? null,
      activeExtensions: extensions.isOk() ? extensions.value.active : [],
    }),
    (cause) => new SessionCompositionError("derive-recovery-locus", "recoveryFrame", cause),
  );
  const recoveryContext = derivedLocusState.andThen(deriveContext);
  const recoveryFrame = recoveryContext.map((value) => value.frame);
  const loadSet = recoveryContext.map((value) => value.loadSet);
  const taskCursor = recoveryContext.isOk() && recoveryContext.value.taskCursor !== null
    ? recoveryContext.map((value) => value.taskCursor as NonNullable<typeof value.taskCursor>)
    : undefined;

  return {
    mode: "recover",
    identity: buildIdentity(identity, role),
    derivedLocusState: toProbe(derivedLocusState),
    locusGuidance: deriveRecoveryLocusSessionGuidance(toProbe(derivedLocusState)),
    recoveryFrame: toProbe(recoveryFrame),
    worktree: toProbe(enrichedWorktree),
    dirty: toProbe(dirty),
    extensions: toProbe(extensions),
    config: toProbe(config),
    releaseRouting: toProbe(releaseRouting),
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

function projectDerivedActiveSession(frame: DerivedLocusFrame): ActiveSessionInitResult {
  const context = frame.active?.context ?? null;
  if (context === null) {
    return {
      mode: "session-init",
      layout: "full",
      resolution: "none",
      path: null,
      candidates: [],
      sessionType: null,
      currentWorkflow: null,
      planningStage: null,
      warnings: [],
    };
  }
  return {
    mode: "session-init",
    layout: "full",
    resolution: "single",
    path: context.metaPath,
    candidates: [],
    taskListPath: context.taskListPath,
    sessionType: context.sessionType,
    currentWorkflow: context.workflow,
    planningStage: context.stage,
    warnings: [],
  };
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

/**
 * Compose recommendations from resolved probe slots. Falls back to skip-
 * everything when any required input failed to resolve — the workflow
 * surfaces probe-failure diagnostics separately, so recommendations stay
 * neutral rather than guessing.
 */
function composeSessionInitRecommendations(slots: {
  worktree: SessionResult<
    import("../../lib/git/worktree-sync.js").WorktreeSyncStatusResult
    | import("../../lib/git/worktree-sync.js").WorktreeSnapshotAnalysisResult
  >;
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

  const userTask = userSlot(identity, (id) => probes.user(id));
  const worktreeTask = safeProbe("worktree", () => probes.worktree());
  const dirtyTask = safeProbe("dirty", () => probes.dirty());
  const releaseRoutingTask = safeProbe("releaseRouting", () => probes.releaseRouting());
  const syncInterlockTask = safeProbe("syncInterlock", () => probes.syncInterlock());
  const headTask = safeProbe("head", () => probes.head());
  const pushabilityTask = safeProbe("pushability", () => probes.pushability());
  const restateCandidatesTask = safeProbe("restateCandidates", () => probes.restateCandidates());
  const extensionsTask = safeProbe("extensions", () => probes.extensions());
  const inboxStateTask = identity === null
    ? null
    : safeProbe("inboxState", () => probes.inboxState(identity));
  // Surface resolution stays inside the composite: rejections become pathSet
  // probe errors rather than aborting the envelope before other slots resolve.
  // The options union requires a resolver whenever identity is non-null, so a
  // successful pathSet never silently nulls identity-global paths for lack of one.
  const surfacesTask = identity === null
    ? okAsync(null as HandoffSurfacePaths | null)
    : safeProbe("pathSet", () => options.resolveHandoffSurfaces());

  const [
    user, worktree, dirty, releaseRouting,
    syncInterlock, head, pushability, restateCandidates, extensions, inboxState, surfaces,
  ] = await Promise.all([
    userTask,
    worktreeTask,
    dirtyTask,
    releaseRoutingTask,
    syncInterlockTask,
    headTask,
    pushabilityTask,
    restateCandidatesTask,
    extensionsTask,
    inboxStateTask,
    surfacesTask,
  ]);

  const derivedLocusState = identity === null
    ? err(new SessionIdentityMissingError("derivedLocusState"))
    : await safeProbe("derivedLocusState", () => probes.derivedLocusState(
        identity,
        extensions.isOk() ? extensions.value.active : [],
      ));
  const active = derivedLocusState.map(projectDerivedActiveSession);

  const branch = worktree.isOk() ? worktree.value.branch : null;
  const handoffActiveWuName = derivedLocusState.isOk()
    ? derivedLocusState.value.active?.subject.key ?? null
    : null;
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
  const deriveHandoff = fromThrowable(
    (frame: DerivedLocusFrame) => deriveHandoffLocusPlan(frame),
    (cause) => new SessionCompositionError("derive-handoff-locus", "handoffLocus", cause),
  );
  const handoffLocus: SessionResult<HandoffLocusPlan> = derivedLocusState.isErr()
    ? err(derivedLocusState.error)
    : deriveHandoff(derivedLocusState.value);

  const pathSet = composeHandoffPathSet({
    surfaces,
    activeWuName: handoffActiveWuName,
  });

  return {
    mode: "session-handoff",
    identity: buildIdentity(identity, role),
    derivedLocusState: toProbe(derivedLocusState),
    locusGuidance: deriveDerivedLocusSessionGuidance(toProbe(derivedLocusState)),
    handoffLocus: toProbe(handoffLocus),
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
    pathSet,
    recommendedSummaryLine,
  };
}

/**
 * Compose the handoff pathSet probe from resolved surfaces + active WU.
 * Surface resolution failures pass through as `ok: false`; absent surfaces
 * (identity null only — the options union requires a resolver otherwise)
 * yield null paths without erroring.
 */
function composeHandoffPathSet(options: {
  surfaces: SessionResult<HandoffSurfacePaths | null>;
  activeWuName: string | null;
}): Probe<HandoffPathSet> {
  if (!options.surfaces.isOk()) {
    // Map surface-resolution failure into the pathSet probe without widening
    // the success value type through toProbe's generic.
    return {
      ok: false,
      error: {
        kind: "runtime",
        message: options.surfaces.error.message,
      },
    };
  }
  const surfaces = options.surfaces.value;
  if (surfaces === null) {
    return { ok: true, value: { sessionNotes: null, workingMemory: null } };
  }
  return {
    ok: true,
    value: {
      sessionNotes: options.activeWuName !== null
        ? surfaces.sessionNotesPath(options.activeWuName)
        : null,
      workingMemory: surfaces.workingMemoryPath,
    },
  };
}
