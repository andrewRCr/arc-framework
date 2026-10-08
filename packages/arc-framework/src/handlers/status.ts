/** Status CLI validation and dispatch to lifecycle, view, and session handlers. */

import * as p from "../lib/terminal.js";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { runConfigSessionInitStatus } from "../commands/config.js";
import { runDomainRulesSessionInitStatus } from "../commands/constitution.js";
import { runExtensionsSessionInitStatus } from "../commands/extensions.js";
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
import { runInboxState } from "../lib/session-init/inbox-state.js";
import {
  composeMaterializableDiscoveryRefreshRemedy,
  findMaterializableWorkUnits,
} from "../lib/session-init/materializable-work-units.js";
import { runNotesCompactionSessionAdvisory } from "../lib/session-init/notes-compaction-advisory.js";
import { runOrphanBranchSweep } from "../lib/session-init/orphan-branch-sweep.js";
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
import { runDerivedLocusStateProbe } from "./derived-locus-state-probe.js";
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
import { createSessionStatusContext } from "./status/session-context.js";
import { handleCompositeStatus, handleRecoverStatus, handleSessionHandoffStatus } from "./status/session.js";
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
  ].filter(Boolean).length;
  if (modeCount > 1) {
    process.stderr.write(
      "Error: a status <slug> query, --session-init, --session-handoff, --recover, --user, and --project are mutually exclusive.\n",
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

  if (slug !== undefined) {
    await handleLifecycleStatus(cwd, exec, slug, opts);
    return;
  }
  const context = await createSessionStatusContext(cwd, exec, transitionExec, localOnlyTransitionExec, interaction);
  if (opts.sessionHandoff) return handleSessionHandoffStatus(context, opts);
  if (opts.recover) return handleRecoverStatus(context, opts);
  if (opts.sessionInit) return handleSessionInitStatus(context, opts);
  if (opts.user) return handleUserStatus(context, opts);
  if (opts.project) return handleProjectStatus(context, opts);
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
  const derivedLocusStatePromises = new Map<string, ReturnType<typeof runDerivedLocusStateProbe>>();
  const getDerivedLocusState = (
    id: string,
    activeExtensions: readonly string[] = [],
  ): ReturnType<typeof runDerivedLocusStateProbe> => {
    const key = `${id}:${JSON.stringify(activeExtensions)}`;
    let pending = derivedLocusStatePromises.get(key);
    if (pending === undefined) {
      pending = (async () => {
        const resolved = await resolvedSettingsP;
        return runDerivedLocusStateProbe({
          cwd,
          identity: id,
          baseBranch: resolved.settings["branch.base"],
          activeExtensions,
          exec,
        });
      })();
      derivedLocusStatePromises.set(key, pending);
    }
    return pending;
  };
  const getOptionalDerivedFrame = async () => {
    if (identity === null) return null;
    try {
      return await getDerivedLocusState(identity);
    } catch {
      return null;
    }
  };
  const getOptionalDerivedRoster = async () => (await getOptionalDerivedFrame())?.roster ?? null;
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
    derivedLocusState: async (id, activeExtensions) => {
      return getDerivedLocusState(id, activeExtensions);
    },
    remoteContext: getRemoteContext,
    user: async (id) => {
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
    extensions: () => runExtensionsSessionInitStatus({ cwd }),
    config: async () => runConfigSessionInitStatus({ cwd, resolvedSettings: await resolvedSettingsP }),
    domainRules: () => runDomainRulesSessionInitStatus({ cwd }),
    releaseRouting: async () => releaseRoutingFromSettings(await resolvedSettingsP),
    currentWuReconcile: async ({ slug, metaPath }) =>
      runCurrentWuReconcileSessionProbe(
        {
          index: await buildLifecycleIndex({ cwd, fs: lifecycleFs }),
          queryDisposition: (input) =>
            queryGitTransitionDisposition(transitionExec, "HEAD", input),
          enumerateTransitionRecords: () => enumerateGitTransitionRecords(transitionExec, "HEAD"),
          listArtifactPaths: (slug, ownedMetaPath) =>
            listCurrentWuArtifactPaths(slug, ownedMetaPath, (path) => readdir(resolve(cwd, path))),
          readFile: (path) => io.readFile(resolve(cwd, path)),
        },
        { slug, metaPath },
      ),
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
          content: await io.readFile(surfaces.workingMemoryPath).catch(() => ""),
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
        fs: {
          readdir: (path) => readdir(path),
          readFile: (path) => readFile(path, "utf8"),
        },
        identity,
        teamMode,
      });
    },
    recovery: async (context, roster, currentBranch) => {
      const resolved = await resolvedSettingsP;
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
        excludeWorktreePath: worktreeIdentity.kind === "linked" ? worktreeIdentity.path : undefined,
        readBlob: (ref, path) => readGitBlobBytes(cwd, ref, path, { objectAccess: "local-only" }),
        derivedRoster,
      });
    },
    orphanBranchSweep: async (context, worktreeIdentity) => {
      const [resolved, derivedRoster] = await Promise.all([
        resolvedSettingsP,
        getOptionalDerivedRoster(),
      ]);
      // Identity-carrying transient branches are excluded because their own
      // lifecycle surfaces own cleanup. An incomplete identity basis declines
      // the sweep rather than offering deletes that could orphan a claim.
      const transient = identity === null
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
        derivedRoster,
      });
    },
    retiredSubdirs: async (context, id) => {
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
      const transientRead = await (input.includeDiscovery
        ? getDiscoveryTransientIndexes()
        : getTransientIndexes());
      const transientState = projectTransientInFlightRead(transientRead);
      const transientIndexes = transientState.indexes;
      let entries: InFlightEntry[] | null = null;
      let residue: InFlightResidue[] = [];
      const baseEvidence = sessionCleanupBaseEvidence(context);
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
      const materializable = findMaterializableWorkUnits({ entries, identity });
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
    inboxState: async (id) => runInboxState({ content: await readUserInbox(id) }),
    partialPushMarker: (id) => runPartialPushMarkerSurface({
      exec,
      identity: id,
      now: new Date().toISOString(),
    }),
    compactionAdvisory: async (id) => runNotesCompactionSessionAdvisory({
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
  const result = await runSessionInitStatus({ identity, role, probes, workingMemoryPath });
  if (opts.writeCompactionSeed && compactionSeedGitSnapshotP !== null) {
    try {
      const gitSnapshot = await compactionSeedGitSnapshotP;
      result.compactionSeedWrite = summarizeCompactionSeedWrite(await emitCompactionSeed({
        cwd,
        envelope: result,
        gitSnapshot,
      }));
      surfaceCompactionSeedWrite(result.compactionSeedWrite);
    } catch (err) {
      result.compactionSeedWrite = {
        status: "failed",
        reason: "git-failed",
        message: errorMessage(err),
      };
      surfaceCompactionSeedWrite(result.compactionSeedWrite);
    }
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
