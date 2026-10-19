/** Status CLI validation and dispatch to lifecycle, view, and session handlers. */

import * as p from "../lib/terminal.js";
import { withPausedCurrentWuActions } from "../lib/session-init/paused-current-wu-actions.js";
import { openDefaultStore } from "./lifecycle-shared.js";
import { createStoreSessionProbes } from "./status/store-session.js";
import { createProjectIdentityReader } from "../lib/store/project-identity.js";
import type { Store } from "../lib/store/contract.js";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { runConfigSessionInitStatus } from "../commands/config.js";
import { runDomainRulesSessionInitStatus } from "../commands/constitution.js";
import type { SessionInitProbes } from "../commands/status.js";
import { buildSessionInitStatusSummary, runSessionInitStatus } from "../commands/status.js";
import { assertSessionInitProbeResult } from "../commands/status/schema.js";
import { runUserSessionInitStatus } from "../commands/user.js";
import { createCurrentBaseDriftAdapters, workUnitPathTreatmentContext } from "../lib/base-drift/current-adapters.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { emitCompactionSeed } from "../lib/compaction-seed/emitter.js";
import { resolveAllSettings } from "../lib/config/resolved-settings.js";
import { projectDeliveryContributionEndpoints } from "../lib/delivery/contribution-proof.js";
import { proveGitDeliveryContribution } from "../lib/delivery/git-contribution-proof.js";
import { observeDeliveryEligibilityRef } from "../lib/delivery/git-eligibility.js";
import { observeGitDeliveryLandingResult } from "../lib/delivery/git-landing-result.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../lib/delivery/plan.js";
import { resolveChangeRequestLifecycleConfiguration } from "../lib/errand/change-request-lifecycle.js";
import {
  projectTransientInFlightRead,
  readFetchedTransientInFlightIndexes,
  readTransientInFlightIndexes,
} from "../lib/errand/record.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
import { analyzeBaseBranchSnapshot, readLocalBaseOid, resolveBaseCheckoutLocus } from "../lib/git/base-branch-sync.js";
import { analyzeBaseDistanceSnapshot, buildBaseDistanceNotApplicable } from "../lib/git/base-distance.js";
import { runDirtyStateStatus } from "../lib/git/dirty-state.js";
import type { RawGitExec } from "../lib/git/exec.js";
import {
  analyzeInFlightSnapshot,
  renderInFlightWarning,
  type InFlightEntry,
  type InFlightResidue,
  type InFlightWarning,
} from "../lib/git/in-flight-derivation.js";
import type { GitExec } from "../lib/git/index.js";
import { filterRosterByIdentity, runIdentityScopedWorktreeRoster, runWorktreeRoster } from "../lib/git/index.js";
import { analyzeRecentRemoteBranchesSnapshot } from "../lib/git/recent-remote-branches.js";
import { readLocalInFlightRefSnapshot } from "../lib/git/remote-ref-reader.js";
import { analyzeSupersessionSnapshot, emptySupersessionResult } from "../lib/git/supersession.js";
import { resolveWorktreeIdentity } from "../lib/git/worktree-identity.js";
import { readWorktreeMarker } from "../lib/git/worktree-marker.js";
import { resolveWorktreePathsByBranchResult } from "../lib/git/worktree-roster.js";
import { analyzeWorktreeSnapshot, readConfiguredUpstreamBranch } from "../lib/git/worktree-sync.js";
import { createGitExec, createRawGitExec, readGitBlobBytes } from "../lib/io-context.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { RECOVERY_RECENCY_DAYS, runBranchGoneRecovery } from "../lib/session-init/branch-gone-recovery.js";
import { resolveCurrentHuskAdvisory } from "../lib/session-init/current-husk-advisory.js";
import { runCurrentWuReconcileSessionProbe } from "../lib/session-init/current-wu-reconcile.js";
import { observeRepositoryDeliveryPosition } from "../lib/session-init/delivery-position-facts.js";
import { readDeliveryPositionView } from "../lib/session-init/delivery-position.js";
import { runErrandStalenessSweep } from "../lib/session-init/errand-staleness-sweep.js";
import { runErrandState } from "../lib/session-init/errand-state.js";
import { extractReminderEntries } from "../lib/session-init/inbox-reminders.js";
import { runPausedWork } from "../lib/session-init/paused-work.js";
import { runInboundBackPressure } from "../lib/session-init/inbound-back-pressure.js";
import { runInboxState } from "../lib/session-init/inbox-state.js";
import {
  composeMaterializableDiscoveryRefreshRemedy,
  findMaterializableWorkUnits,
} from "../lib/session-init/materializable-work-units.js";
import { runNotesCompactionSessionAdvisory } from "../lib/session-init/notes-compaction-advisory.js";
import { runOrphanBranchSweep } from "../lib/session-init/orphan-branch-sweep.js";
import { runHooksPathSessionAdvisory } from "../lib/session-init/hooks-path-advisory.js";
import { runPartialPushMarkerSurface } from "../lib/session-init/partial-push-marker-surface.js";
import { runRetiredSubdirDetection } from "../lib/session-init/retired-subdir-detection.js";
import { runStaleWorktreeSweep } from "../lib/session-init/stale-worktree-sweep.js";
import { createGhWorkUnitPrSource } from "../lib/session-init/work-unit-pr-source.js";
import { runWorkUnitState } from "../lib/session-init/work-unit-state.js";
import { analyzeUserReferenceAuthority, projectUserReferenceSessionResult } from "../lib/user-reference-reconcile.js";
import {
  enumerateGitTransitionRecords,
  queryGitTransitionDisposition,
} from "../lib/work-unit/git-transition-record-enumeration.js";
import { buildLifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { listParkedSlugs } from "../lib/work-unit/lifecycle-resolver.js";
import { listCurrentWuArtifactPaths } from "../lib/work-unit/reference-reconcile.js";
import { revalidateDecodedHuskRetirementEvidenceStrict } from "../lib/work-unit/teardown-retirement-driver.js";
import { hostedGhRunner } from "../scripts/review-gate/hosted/gh-process.js";
import { readDerivedLocusStateSnapshot, runDerivedLocusStateProbe } from "./derived-locus-state-probe.js";
import { requireArcProjectRoot } from "./shared.js";
import {
  createSessionRemoteContextReader,
  sessionRemotePrerequisites,
  type SessionRemoteContext,
} from "./status-remote-context.js";
import type { SessionStatusContext } from "./status/session-context.js";
import {
  createSessionDeliveryObservationHost,
  ERRAND_NUDGE_MARKER_RELATIVE,
  errorMessage,
  exactSessionBaseOid,
  NOTES_COMPACTION_NUDGE_MARKER_RELATIVE,
  parsePositiveInteger,
  readCompactionSeedGitSnapshot,
  readSessionBranch,
  releaseRoutingFromSettings,
  resolveNudgeState,
  resolveSessionInitDirtyState,
  sessionCleanupBaseEvidence,
  sessionPathTreatmentWorkUnit,
  summarizeCompactionSeedWrite,
  surfaceCompactionSeedWrite,
  WORK_UNIT_STALE_NUDGE_MARKER_RELATIVE,
} from "./status/session-evidence.js";

import { StatusCommandInputSchema, type StatusCliOptions } from "./status/input.js";
import { handleLifecycleStatus } from "./status/lifecycle.js";
import { createSessionStatusContext, readWorkingMemoryFromStore } from "./status/session-context.js";
import { handleCompositeStatus, handleRecoverStatus, handleSessionHandoffStatus } from "./status/session.js";
import { handleConflictStatus } from "./status/conflicts.js";
import { handleProjectStatus, handleUserStatus } from "./status/views.js";

export {
  statusCommandInputPolicyDeclarations,
  statusCommandInputRegistration,
  StatusCommandInputSchema,
} from "./status/input.js";
export type { StatusCliOptions } from "./status/input.js";
export {
  createSessionDeliveryObservationHost,
  exactSessionBaseOid,
  resolveSessionInitDirtyState,
  sessionPathTreatmentWorkUnit,
} from "./status/session-evidence.js";

/**
 * Validate and dispatch a status invocation before acquiring mode-specific I/O.
 * @param slug - Optional lifecycle subject.
 * @param opts - CLI status options.
 * @param interaction - Invocation subprocess policy.
 * @returns Completion after writing the selected status output.
 */
export async function handleStatus(
  slug: string | undefined,
  opts: StatusCliOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const exec = createGitExec(interaction?.subprocess);
  const parsed = StatusCommandInputSchema.safeParse({ slug, ...opts });
  if (!parsed.success) {
    process.stderr.write(`${z.prettifyError(parsed.error)}\n`);
    process.exitCode = 1;
    return;
  }
  slug = parsed.data.slug;
  opts = parsed.data;
  const modeCount = [
    slug !== undefined,
    opts.sessionInit,
    opts.sessionHandoff,
    opts.recover,
    opts.user,
    opts.project,
    opts.conflicts !== undefined && opts.conflicts !== false,
  ].filter(Boolean).length;
  if (modeCount > 1) {
    process.stderr.write(
      "Error: a status <slug> query, --session-init, --session-handoff, --recover, --user, --project, and --conflicts are mutually exclusive.\n",
    );
    process.exitCode = 1;
    return;
  }
  if (opts.writeCompactionSeed && !opts.sessionInit) {
    process.stderr.write("Error: --write-compaction-seed requires --session-init.\n");
    process.exitCode = 1;
    return;
  }

  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const transitionExec = createRawGitExec(cwd);
  const localOnlyTransitionExec: RawGitExec = (args, options) => transitionExec(args, {
    ...options,
    objectAccess: "local-only",
  });

  const context = await createSessionStatusContext(cwd, exec, transitionExec, localOnlyTransitionExec, interaction);
  if (slug !== undefined) {
    await handleLifecycleStatus(context, slug, opts);
    return;
  }
  if (opts.sessionHandoff) return handleSessionHandoffStatus(context, opts);
  if (opts.recover) return handleRecoverStatus(context, opts);
  if (opts.sessionInit) return handleSessionInitStatus(context, opts);
  if (opts.user) return handleUserStatus(context, opts);
  if (opts.project) return handleProjectStatus(context, opts);
  if (opts.conflicts !== undefined && opts.conflicts !== false) return handleConflictStatus(context, opts);
  await handleCompositeStatus(context, opts);
}

/**
 * Execute the session init status mode.
 * @param context - Request-scoped I/O, identity, and personal-surface readers.
 * @param opts - Validated status options.
 * @returns Completion after writing the selected status output.
 */
async function handleSessionInitStatus(context: SessionStatusContext, opts: StatusCliOptions): Promise<void> {
  const {
    cwd,
    exec,
    transitionExec,
    localOnlyTransitionExec,
    io,
    identity,
    role,
    lifecycleFs,
    userSurfacesFor,
    readUserInbox,
  } = context;
  const json = Boolean(opts.json);
  const store = context.store ?? openDefaultStore(cwd, exec);
  const stateOffBranch = store.capabilities.stateOffBranch;
  const projectId = store.capabilities.stateOffBranch ? createProjectIdentityReader(store) : undefined;
  // A missing stdin-capable executor degrades object availability inside the remote
  // context rather than aborting here: throwing before any probe runs would deny the
  // caller the whole composite envelope over one unrelated capability.
  // See sessionHandoff branch above for the rationale on caching the
  // resolution promise rather than awaiting eagerly.
  const resolvedSettingsP = resolveAllSettings({ cwd, exec, readFile: io.readFile });
  const deliveryPublisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  const deliveryPlans = new RepositoryDeliveryPlanStore(deliveryPublisher, DeliveryPlanV1Codec);
  const deliveryStates = new RepositoryDeliveryStateStore(deliveryPublisher);
  const getRemoteContext = createSessionRemoteContextReader({
    cwd,
    exec,
    execInput: io.execInput,
    remoteSyncEnabled: async () =>
      (await resolvedSettingsP).settings["session.remote_sync"] === "enabled",
  });
  const derivedLocusStatePromises = new Map<string, ReturnType<typeof readDerivedLocusStateSnapshot>>();
  const getDerivedLocusStateSnapshot = (
    id: string,
  ): ReturnType<typeof readDerivedLocusStateSnapshot> => {
    let pending = derivedLocusStatePromises.get(id);
    if (pending === undefined) {
      pending = (async () => {
        // The user slot owns pull failures; sibling probes can still read local state.
        if (stateOffBranch) await getStoreUser().catch(() => null);
        const resolved = await resolvedSettingsP;
        return readDerivedLocusStateSnapshot({
          cwd,
          identity: id,
          baseBranch: resolved.settings["branch.base"],
          exec, store,
        });
      })();
      derivedLocusStatePromises.set(id, pending);
    }
    return pending;
  };
  const getDerivedLocusState = (id: string): ReturnType<typeof runDerivedLocusStateProbe> =>
    getDerivedLocusStateSnapshot(id).then(snapshot => snapshot.frame);
  const getOptionalDerivedFrame = async () => {
    if (identity === null) return null;
    try {
      return await getDerivedLocusState(identity);
    } catch {
      return null;
    }
  };
  const getOptionalDerivedRoster = async () => (await getOptionalDerivedFrame())?.roster ?? null;
  const operational = stateOffBranch ? createStoreSessionProbes({
    store, sync: context.storeSync, cwd, exec, identity, projectId,
    readFrame: getOptionalDerivedFrame,
    readSettings: async () => (await resolvedSettingsP).settings,
    readUserInbox,
  }) : null;
  let storeUserPull: ReturnType<NonNullable<typeof operational>["user"]> | undefined;
  const getStoreUser = () => storeUserPull ??= operational?.user() ?? Promise.resolve(null);
  const compactionSeedGitSnapshotP = opts.writeCompactionSeed
    ? readCompactionSeedGitSnapshot(cwd, exec)
    : null;
  // Shared in-flight oracle slice over the request's immutable remote context.
  // Errand state and materializable-WU discovery share one local classification
  // pass; the separately typed transient-identity read remains outside the code
  // repository snapshot.
  let oraclePromise: Promise<{
    entries: InFlightEntry[];
    residue: InFlightResidue[];
    warnings: InFlightWarning[];
    reachable: boolean;
    remoteEvidence: "exact" | "pending-fetch" | "unreachable" | "not-applicable";
    failureReason?: "network" | "auth" | "timeout" | "error";
    pendingBranchCount: number;
    locallyPresentBranches: ReadonlySet<string>;
  }> | undefined;
  let oracleContext: SessionRemoteContext | undefined;
  let transientIndexesPromise: ReturnType<typeof readTransientInFlightIndexes> | undefined;
  let discoveryTransientIndexesPromise: ReturnType<typeof readFetchedTransientInFlightIndexes> | undefined;
  const getTransientIndexes = () => {
    transientIndexesPromise ??= readTransientInFlightIndexes({ exec, identity });
    return transientIndexesPromise;
  };
  const getDiscoveryTransientIndexes = () => {
    discoveryTransientIndexesPromise ??= readFetchedTransientInFlightIndexes({
      exec,
      identity,
      remote: "origin",
    });
    return discoveryTransientIndexesPromise;
  };
  const getOracle = (context: SessionRemoteContext): Promise<{
    entries: InFlightEntry[];
    residue: InFlightResidue[];
    warnings: InFlightWarning[];
    reachable: boolean;
    remoteEvidence: "exact" | "pending-fetch" | "unreachable" | "not-applicable";
    failureReason?: "network" | "auth" | "timeout" | "error";
    pendingBranchCount: number;
    locallyPresentBranches: ReadonlySet<string>;
  }> => {
    if (oracleContext !== undefined && oracleContext !== context) {
      return Promise.reject(new Error("In-flight oracle received a different session remote context."));
    }
    oracleContext = context;
    oraclePromise ??= (async () => {
      const prerequisites = sessionRemotePrerequisites(context);
      if (prerequisites.kind === "not-needed") {
        return {
          entries: [],
          residue: [],
          warnings: [],
          reachable: false,
          remoteEvidence: "not-applicable" as const,
          pendingBranchCount: 0,
          locallyPresentBranches: new Set<string>(),
        };
      }
      if (prerequisites.snapshot.kind === "unreachable") {
        return {
          entries: [],
          residue: [],
          warnings: [],
          reachable: false,
          remoteEvidence: "unreachable" as const,
          failureReason: prerequisites.snapshot.failureReason,
          pendingBranchCount: 0,
          locallyPresentBranches: new Set<string>(),
        };
      }
      const resolved = await resolvedSettingsP;
      const teamMode = resolved.settings["team.mode"] === "true";
      const [transientRead, parkedSlugs, derivedRoster, localRefs, worktrees] = await Promise.all([
        getDiscoveryTransientIndexes(),
        buildLifecycleIndex({ cwd, fs: lifecycleFs }).then(listParkedSlugs),
        getOptionalDerivedRoster(),
        // Default remote, request root: these local reads join the snapshot and
        // availability facts this request context already carries.
        readLocalInFlightRefSnapshot(exec, undefined, cwd),
        resolveWorktreePathsByBranchResult(exec, cwd),
      ]);
      const transient = projectTransientInFlightRead(transientRead);
      const transientIndexes = transient.indexes;
      const result = await analyzeInFlightSnapshot({
        exec,
        snapshot: prerequisites.snapshot,
        objectAvailability: prerequisites.objectAvailability,
        history: prerequisites.history,
        localRefs,
        worktrees,
        baseBranch: resolved.settings["branch.base"],
        identity,
        teamMode,
        errandSlugByBranch: transientIndexes.slugByBranch,
        expectedTransientByBranch: transientIndexes.expectedByBranch,
        errandRecordsComplete: transient.complete,
        parkedSlugs,
        derivedRoster,
      });
      return {
        entries: result.entries,
        residue: result.residue,
        warnings: result.warnings,
        reachable: true,
        remoteEvidence: result.pendingBranchCount > 0 ? "pending-fetch" as const : "exact" as const,
        pendingBranchCount: result.pendingBranchCount,
        locallyPresentBranches: new Set([
          ...Object.keys(localRefs.refs.localHeads),
          ...worktrees.paths.keys(),
        ]),
      };
    })();
    return oraclePromise;
  };
  const probes: SessionInitProbes = {
    derivedLocusState: async (id) => {
      return getDerivedLocusState(id);
    },
    remoteContext: getRemoteContext,
    user: async (id) => {
      if (operational !== null) return getStoreUser();
      const resolved = await resolvedSettingsP;
      const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
      return runUserSessionInitStatus({ cwd, io, identity: id, remoteSyncEnabled });
    },
    worktree: async (context) => {
      const resolved = await resolvedSettingsP;
      const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
      const branch = await readSessionBranch(exec, cwd);
      const prerequisites = sessionRemotePrerequisites(context);
      const upstreamBranch = branch === null || !remoteSyncEnabled || context.kind === "not-needed"
        ? null
        : await readConfiguredUpstreamBranch(exec, branch, cwd);
      const supplied = prerequisites.kind === "supplied"
        ? prerequisites
        : {
            snapshot: { kind: "unreachable" as const, failureReason: "error" as const },
            objectAvailability: { kind: "unavailable" as const, reason: "execution" as const },
            history: { kind: "unavailable" as const, reason: "execution" as const },
          };
      return analyzeWorktreeSnapshot({
        exec,
        remoteSyncEnabled,
        originConfigured: !(context.kind === "not-needed" && context.reason === "no-remote"),
        branch,
        upstreamBranch,
        ...supplied,
      });
    },
    worktreeIdentity: () => resolveWorktreeIdentity(exec),
    currentHusk: async (context, worktreePath) => {
      const [marker, headResult, resolved] = await Promise.all([
        readWorktreeMarker(worktreePath),
        exec("git", ["rev-parse", "HEAD"], { cwd: worktreePath }),
        resolvedSettingsP,
      ]);
      return await resolveCurrentHuskAdvisory({
        worktreePath,
        branch: null,
        head: headResult.stdout,
        marker,
      }, async (stamp, decoded) => {
        const baseBranch = resolved.settings["branch.base"];
        const baseOid = exactSessionBaseOid(sessionCleanupBaseEvidence(context), baseBranch);
        return baseOid !== null && await revalidateDecodedHuskRetirementEvidenceStrict(
          exec,
          stamp,
          decoded,
          baseOid,
          (ref, path) => readGitBlobBytes(cwd, ref, path, { objectAccess: "local-only" }),
        );
      });
    },
    baseDistance: async (context) => {
      const resolved = await resolvedSettingsP;
      const baseBranch = resolved.settings["branch.base"];
      const prerequisites = sessionRemotePrerequisites(context);
      // Detachment outranks the remote shortcuts, as it does inside the analyzer:
      // returning early on a disabled or absent remote would drop the detached-HEAD
      // reason whenever both conditions hold.
      if (await readSessionBranch(exec, cwd) === null) {
        return buildBaseDistanceNotApplicable("detached-head", baseBranch);
      }
      if (prerequisites.kind === "not-needed") {
        return prerequisites.reason === "remote-sync-disabled"
          ? buildBaseDistanceNotApplicable("skipped", baseBranch)
          : buildBaseDistanceNotApplicable("no-remote", baseBranch);
      }
      const localOnlyExec: GitExec = (command, args, options) => exec(command, args, {
        ...options,
        objectAccess: "local-only",
      });
      const frame = await getOptionalDerivedFrame();
      const workUnit = frame === null ? null : sessionPathTreatmentWorkUnit(frame);
      return analyzeBaseDistanceSnapshot({
        exec,
        baseBranch,
        mode: "advisory",
        snapshot: prerequisites.snapshot,
        objectAvailability: prerequisites.objectAvailability,
        history: prerequisites.history,
        ...createCurrentBaseDriftAdapters(
          localOnlyExec,
          workUnit === null ? {} : workUnitPathTreatmentContext(workUnit.name),
        ),
      });
    },
    baseBranchSync: async (context) => {
      const resolved = await resolvedSettingsP;
      const baseBranch = resolved.settings["branch.base"];
      const [checkout, localBaseOid] = await Promise.all([
        resolveBaseCheckoutLocus(exec, baseBranch),
        readLocalBaseOid(exec, baseBranch, cwd),
      ]);
      const prerequisites = sessionRemotePrerequisites(context);
      if (prerequisites.kind === "not-needed") {
        return {
          state: prerequisites.reason === "remote-sync-disabled" ? "skipped" as const : "no-remote" as const,
          ahead: 0,
          behind: 0,
          base: baseBranch,
          checkout,
          refreshRemedy: null,
          guidance: null,
          remoteEvidence: "not-applicable" as const,
        };
      }
      return analyzeBaseBranchSnapshot({
        exec,
        baseBranch,
        localBaseOid,
        checkout,
        snapshot: prerequisites.snapshot,
        objectAvailability: prerequisites.objectAvailability,
        history: prerequisites.history,
      });
    },
    supersession: (context, branch) => {
      const prerequisites = sessionRemotePrerequisites(context);
      if (prerequisites.kind === "not-needed") {
        return Promise.resolve(emptySupersessionResult());
      }
      return analyzeSupersessionSnapshot({ exec, branch, ...prerequisites });
    },
    dirty: () => resolveSessionInitDirtyState({
      compactionSeedGitSnapshotP,
      fallback: () => runDirtyStateStatus({ exec }),
    }),
    config: async () => runConfigSessionInitStatus({ cwd, resolvedSettings: await resolvedSettingsP }),
    domainRules: () => runDomainRulesSessionInitStatus({ cwd }),
    hooksPath: () => runHooksPathSessionAdvisory({
      cwd,
      exec: async (command, args, opts) => {
        const { stdout } = await exec(command, [...args], { cwd: opts.cwd });
        return { stdout };
      },
    }),
    releaseRouting: async () => releaseRoutingFromSettings(await resolvedSettingsP),
    currentWuReconcile: async ({ slug, metaPath }) => {
      const result = await runCurrentWuReconcileSessionProbe(
        stateOffBranch ? { store } : {
          index: await buildLifecycleIndex({ cwd, fs: lifecycleFs }),
          queryDisposition: (input) =>
            queryGitTransitionDisposition(transitionExec, "HEAD", input),
          enumerateTransitionRecords: () => enumerateGitTransitionRecords(transitionExec, "HEAD"),
          listArtifactPaths: (slug, ownedMetaPath) =>
            listCurrentWuArtifactPaths(slug, ownedMetaPath, (path) => readdir(resolve(cwd, path))),
          readFile: (path) => io.readFile(resolve(cwd, path)),
        },
        { slug, metaPath, checkoutPath: cwd },
      );
      return stateOffBranch
        ? withPausedCurrentWuActions(result, store, (await getOptionalDerivedFrame())?.active?.context ?? null) : result;
    },
    deliveryPosition: async (context, { workUnitId }) => {
      const result = await readDeliveryPositionView(workUnitId, {
        plans: {
          enumerateCurrentReadOnly: () => deliveryPlans.enumerateCurrentReadOnly(),
        },
        states: deliveryStates,
        observe: async (plan, state, revision) => {
          const prerequisites = sessionRemotePrerequisites(context);
          const objectAvailability = prerequisites.kind === "supplied"
            ? prerequisites.objectAvailability
            : null;
          if (prerequisites.kind === "not-needed"
            || prerequisites.snapshot.kind !== "available"
            || objectAvailability?.kind !== "complete") {
            return { status: "refused" };
          }
          const resolved = await resolvedSettingsP;
          const configuration = await resolveChangeRequestLifecycleConfiguration(
            exec,
            `refs/heads/${resolved.settings["branch.base"]}`,
          );
          const deliveryHost = createSessionDeliveryObservationHost(hostedGhRunner);
          return configuration === null
            ? { status: "refused" }
            : observeRepositoryDeliveryPosition(plan, state, revision, {
              exec,
              cwd,
              host: deliveryHost,
              repository: configuration.repositoryRef,
              remoteHeads: prerequisites.snapshot.tips,
              localCommits: objectAvailability.commits,
              materializeTarget: async (coordinates) => {
                if (objectAvailability.commits[coordinates.head] !== true) return false;
                const localOnlyExec: GitExec = (command, args, options) => exec(command, args, {
                  ...options,
                  cwd,
                  objectAccess: "local-only",
                });
                const local = await observeDeliveryEligibilityRef(localOnlyExec, coordinates.head);
                return local?.head === coordinates.head && local.tree === coordinates.tree;
              },
              observeLandedResult: ({ mergeCommitSha, strategy, beforeMember }) => (
                observeGitDeliveryLandingResult({
                  exec, cwd, remote: "origin", resultHead: mergeCommitSha, strategy, beforeMember,
                })
              ),
              proveContribution: (endpoints) => proveGitDeliveryContribution({
                exec: createRawGitExec(cwd),
                ...projectDeliveryContributionEndpoints(endpoints),
              }),
            }, { terminalAuthoringMovement: "allow-append-only" });
        },
      });
      if (result.status === "refused") {
        throw new Error(`Delivery position is unavailable: ${result.reason}.`);
      }
      return result.value;
    },
    userReferenceReconcile: async (context, { slug }) => {
      if (operational !== null) return operational.userReferenceReconcile(slug);
      if (identity === null) throw new Error("User-reference probe requires an identity.");
      const resolved = await resolvedSettingsP;
      const surfaces = await userSurfacesFor(identity);
      const protection = resolved.settings["branch.protection"] === "full" ? "full" : "partial";
      const baseBranch = resolved.settings["branch.base"];
      const prerequisites = sessionRemotePrerequisites(context);
      const authority = prerequisites.kind === "supplied" || protection === "partial"
        ? await analyzeUserReferenceAuthority({
          protection,
          baseBranch,
          // The unsupplied arms are reachable only under `partial` protection, which
          // returns before either is read. They are placeholders for an unused
          // parameter rather than evidence, and never reach a result.
          snapshot: prerequisites.kind === "supplied"
            ? prerequisites.snapshot
            : { kind: "unreachable", failureReason: "error" },
          objectAvailability: prerequisites.kind === "supplied"
            ? prerequisites.objectAvailability
            : { kind: "unavailable", reason: "execution" },
          enumerateAt: (ref) => enumerateGitTransitionRecords(localOnlyTransitionExec, ref),
        })
        : {
            // `not-needed` means remote sync is off or no remote is configured. That is
            // a deliberate configuration, not a failed read, so this reports the
            // not-applicable qualifier as the sibling probes do rather than fabricating
            // an unreachable reading the operator would read as a network fault.
            status: "unavailable" as const,
            ref: `origin/${baseBranch}`,
            reason: "remote-not-required" as const,
            remoteEvidence: "not-applicable" as const,
          };
      const sessionNotesPath = surfaces.sessionNotesPath(SlugSchema.parse(slug));
      return projectUserReferenceSessionResult(authority, {
        userInbox: {
          path: surfaces.identityGlobalDisplayPath("USER-INBOX.md"),
          content: await readUserInbox(identity),
        },
        workingMemory: {
          path: surfaces.workingMemoryDisplayPath,
          content: await readWorkingMemoryFromStore(store, identity).catch(() => ""),
        },
        sessionNotes: {
          path: sessionNotesPath,
          content: await io.readFile(sessionNotesPath).catch(() => ""),
        },
      });
    },
    roster: async () => {
      const resolved = await resolvedSettingsP;
      const teamMode = resolved.settings["team.mode"] === "true";
      const roster = await runWorktreeRoster({
        exec,
        store, cwd,
        fs: {
          readdir: (path) => readdir(path),
          readFile: (path) => readFile(path, "utf8"),
        },
      });
      return filterRosterByIdentity(roster, { identity, teamMode });
    },
    cleanupRoster: async () => {
      const resolved = await resolvedSettingsP;
      const teamMode = resolved.settings["team.mode"] === "true";
      return runIdentityScopedWorktreeRoster({
        exec,
        store, cwd,
        fs: {
          readdir: (path) => readdir(path),
          readFile: (path) => readFile(path, "utf8"),
        },
        identity,
        teamMode,
      });
    },
    recovery: async (context, roster, currentBranch) => {
      const [resolved, derivedRoster] = await Promise.all([resolvedSettingsP, getOptionalDerivedRoster()]);
      const baseBranch = resolved.settings["branch.base"];
      const baseEvidence = sessionCleanupBaseEvidence(context);
      const recent = baseEvidence.remoteSyncEnabled && baseEvidence.snapshot.kind === "available"
        ? await analyzeRecentRemoteBranchesSnapshot({
            exec,
            tips: baseEvidence.snapshot.tips,
            objectAvailability: baseEvidence.objectAvailability,
            history: baseEvidence.history,
            excludeBranches: new Set([baseBranch, ...(currentBranch === null ? [] : [currentBranch])]),
            withinDays: RECOVERY_RECENCY_DAYS,
          })
        : { branches: [], pendingBranchCount: 0 };
      return runBranchGoneRecovery({
        roster,
        derivedRoster,
        currentBranch,
        baseBranch,
        recentBranches: recent.branches,
        recentPendingBranchCount: recent.pendingBranchCount,
        baseEvidence,
        exec,
      });
    },
    sweep: async (context, roster, worktreeIdentity) => {
      const [resolved, derivedRoster] = await Promise.all([
        resolvedSettingsP,
        getOptionalDerivedRoster(),
      ]);
      return runStaleWorktreeSweep({
        roster,
        worktreeIdentity,
        baseBranch: resolved.settings["branch.base"],
        baseEvidence: sessionCleanupBaseEvidence(context),
        exec,
        identity,
        teamMode: resolved.settings["team.mode"] === "true",
        protection: resolved.settings["branch.protection"] === "full" ? "full" : "partial",
        excludeWorktreePath: stateOffBranch ? cwd : worktreeIdentity.kind === "linked" ? worktreeIdentity.path : undefined,
        readBlob: (ref, path) => readGitBlobBytes(cwd, ref, path, { objectAccess: "local-only" }),
        derivedRoster, store, projectId,
      });
    },
    orphanBranchSweep: async (context, worktreeIdentity) => {
      const [resolved, frame] = await Promise.all([
        resolvedSettingsP,
        getOptionalDerivedFrame(),
      ]);
      // Identity-carrying transient branches are excluded because their own
      // lifecycle surfaces own cleanup. An incomplete identity basis declines
      // the sweep rather than offering deletes that could orphan a claim.
      const transient = stateOffBranch || identity === null
        ? null
        : projectTransientInFlightRead(await getTransientIndexes());
      return runOrphanBranchSweep({
        worktreeIdentity,
        baseBranch: resolved.settings["branch.base"],
        baseEvidence: sessionCleanupBaseEvidence(context),
        errandBranches:
          transient === null || !transient.complete
            ? null
            : new Set(transient.indexes.slugByBranch.keys()),
        exec,
        derivedRoster: frame?.roster ?? null, store, projectId, identity: identity ?? undefined,
        claims: frame?.identityDiscovery.kind === "store" ? frame.identityDiscovery.claims : undefined,
      });
    },
    retiredSubdirs: async (context, id) => {
      if (stateOffBranch) return { candidates: [] };
      const resolved = await resolvedSettingsP;
      return runRetiredSubdirDetection({
        cwd,
        identity: id,
        baseBranch: resolved.settings["branch.base"],
        baseEvidence: sessionCleanupBaseEvidence(context),
        exec,
        readDir: io.readDir,
        readFile: io.readFile,
      });
    },
    errandSweep: async (id) => {
      const resolved = await resolvedSettingsP;
      const thresholdDays = parsePositiveInteger(resolved.settings["inbox.remind_after_days"], 1);
      const { entries } = extractReminderEntries({ content: await readUserInbox(id) });
      return runErrandStalenessSweep({ entries, thresholdDays });
    },
    errandState: async (context, input) => {
      const resolved = await resolvedSettingsP;
      const thresholdDays = parsePositiveInteger(resolved.settings["inbox.remind_after_days"], 1);
      const baseEvidence = sessionCleanupBaseEvidence(context);
      const storeRemoteTips = new Map(baseEvidence.remoteSyncEnabled && baseEvidence.snapshot.kind === "available"
        ? Object.entries(baseEvidence.snapshot.tips) : []);
      if (operational !== null) return operational.errandState({ exec,
        currentBranch: input.currentBranch, hasBackingMeta: input.hasBackingMeta, includeDiscovery: input.includeDiscovery,
        remoteTips: storeRemoteTips,
        baseEvidence: sessionCleanupBaseEvidence(context), baseBranch: resolved.settings["branch.base"], staleThresholdDays: thresholdDays,
        nudge: input.includeNudge ? await resolveNudgeState(cwd, io, identity, ERRAND_NUDGE_MARKER_RELATIVE, userSurfacesFor)
          : { shouldNudge: false, markerPath: null, today: new Date().toISOString().slice(0, 10) },
      });
      const transientRead = await (input.includeDiscovery
        ? getDiscoveryTransientIndexes()
        : getTransientIndexes());
      const transientState = projectTransientInFlightRead(transientRead);
      const transientIndexes = transientState.indexes;
      let entries: InFlightEntry[] | null = null;
      let residue: InFlightResidue[] = [];
      const remoteTips = new Map(
        baseEvidence.remoteSyncEnabled && baseEvidence.snapshot.kind === "available"
          ? Object.entries(baseEvidence.snapshot.tips)
          : [],
      );
      let oracleWarnings: string[] = transientState.degraded === null ? [] : [transientState.degraded];
      let locallyPresentBranches: ReadonlySet<string> = new Set();
      if (input.includeDiscovery) {
        const oracle = await getOracle(context);
        entries = oracle.reachable ? oracle.entries : null;
        residue = oracle.residue;
        locallyPresentBranches = oracle.locallyPresentBranches;
        oracleWarnings = [...oracleWarnings, ...oracle.warnings.map(renderInFlightWarning)];
      }
      return runErrandState({
        exec,
        currentBranch: input.currentBranch,
        hasBackingMeta: input.hasBackingMeta,
        includeDiscovery: input.includeDiscovery,
        entries,
        residue,
        oracleWarnings,
        records: transientIndexes.records,
        recordsComplete: transientState.complete,
        remoteTips,
        locallyPresentBranches,
        baseEvidence,
        baseBranch: resolved.settings["branch.base"],
        staleThresholdDays: thresholdDays,
        nudge: input.includeNudge
          ? await resolveNudgeState(cwd, io, identity, ERRAND_NUDGE_MARKER_RELATIVE, userSurfacesFor)
          : { shouldNudge: false, markerPath: null, today: new Date().toISOString().slice(0, 10) },
      });
    },
    materializableWorkUnits: async (context) => {
      if (operational !== null) return operational.materializableWorkUnits();
      const {
        entries,
        warnings,
        reachable,
        remoteEvidence,
        failureReason,
        pendingBranchCount,
      } = await getOracle(context);
      const renderedWarnings = warnings.map(renderInFlightWarning);
      if (!reachable) {
        return remoteEvidence === "unreachable"
          ? {
              candidates: [],
              warnings: renderedWarnings,
              remoteEvidence,
              failureReason: failureReason ?? "error",
              pendingBranchCount: 0 as const,
              refreshRemedy: null,
            }
          : {
              candidates: [],
              warnings: renderedWarnings,
              remoteEvidence: "not-applicable" as const,
              pendingBranchCount: 0 as const,
              refreshRemedy: null,
            };
      }
      const materializable = findMaterializableWorkUnits({ entries, identity, pendingBranchCount });
      return pendingBranchCount > 0
        ? {
            ...materializable,
            warnings: renderedWarnings,
            remoteEvidence: "pending-fetch" as const,
            pendingBranchCount,
            refreshRemedy: composeMaterializableDiscoveryRefreshRemedy(),
          }
        : {
            ...materializable,
            warnings: renderedWarnings,
            remoteEvidence: "exact" as const,
            pendingBranchCount: 0 as const,
            refreshRemedy: null,
          };
    },
    workUnitState: async (context, input) => {
      const resolved = await resolvedSettingsP;
      const staleThresholdDays = parsePositiveInteger(
        resolved.settings["integration.stale_after_days"],
        2,
      );
      return runWorkUnitState({
        exec,
        roster: input.roster.entries,
        identity,
        baseBranch: resolved.settings["branch.base"],
        baseEvidence: sessionCleanupBaseEvidence(context),
        staleThresholdDays,
        nudge: await resolveNudgeState(
          cwd,
          io,
          identity,
          WORK_UNIT_STALE_NUDGE_MARKER_RELATIVE,
          userSurfacesFor,
        ),
        prSource: input.includeSharpening ? createGhWorkUnitPrSource(exec) : undefined,
      });
    },
    inboxState: async (id) => operational !== null ? operational.inboxState(id) : runInboxState({ content: await readUserInbox(id) }),
    pausedWork: () => operational !== null ? operational.pausedWork() : Promise.resolve(runPausedWork()),
    inboundBackPressure: () => operational !== null ? operational.inboundBackPressure() : Promise.resolve(runInboundBackPressure()),
    partialPushMarker: (id) => stateOffBranch ? Promise.resolve({ markers: [] }) : runPartialPushMarkerSurface({
      exec,
      identity: id,
      now: new Date().toISOString(),
    }),
    compactionAdvisory: stateOffBranch ? undefined : async (id) => runNotesCompactionSessionAdvisory({
      exec,
      identity: id,
      nudge: await resolveNudgeState(
        cwd,
        io,
        id,
        NOTES_COMPACTION_NUDGE_MARKER_RELATIVE,
        userSurfacesFor,
      ),
    }),
  };
  const workingMemoryPath = identity === null
    ? null
    : (await userSurfacesFor(identity)).workingMemoryPath;
  const result = await runSessionInitStatus({ identity, role, probes, workingMemoryPath, stateOffBranch });
  if (opts.writeCompactionSeed && compactionSeedGitSnapshotP !== null) {
    await writeSessionCompactionSeed({ cwd, exec, store, result, gitSnapshot: compactionSeedGitSnapshotP,
      snapshot: derivedLocusStatePromises.get(identity ?? "") });
  }
  assertSessionInitProbeResult(result);
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  p.intro("arc status");
  p.note(buildSessionInitStatusSummary(result), "Session Init");
  p.outro("Done.");
  return;
}

async function writeSessionCompactionSeed(input: {
  cwd: string; exec: GitExec; store: Store; result: Awaited<ReturnType<typeof runSessionInitStatus>>;
  gitSnapshot: ReturnType<typeof readCompactionSeedGitSnapshot>; snapshot?: ReturnType<typeof readDerivedLocusStateSnapshot>;
}): Promise<void> {
  try {
    const [gitSnapshot, snapshot] = await Promise.all([input.gitSnapshot, input.snapshot?.catch(() => undefined)]);
    input.result.compactionSeedWrite = summarizeCompactionSeedWrite(await emitCompactionSeed({
      cwd: input.cwd, exec: input.exec, envelope: input.result, gitSnapshot, store: input.store,
      ...(input.store.capabilities.stateOffBranch ? { stateVersion: snapshot?.stateVersion ?? null } : {}),
    }));
  } catch (err) {
    input.result.compactionSeedWrite = { status: "failed", reason: "git-failed", message: errorMessage(err) };
  }
  surfaceCompactionSeedWrite(input.result.compactionSeedWrite);
}
