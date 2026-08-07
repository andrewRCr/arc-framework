/**
 * Handler for `arc status` — the composite probe orchestrator.
 *
 * Reads configured identity and role pointers in parallel,
 * builds the default probe bundle from real I/O, and delegates orchestration
 * to {@link runStatus} / {@link runSessionInitStatus}. Branches on scope
 * (`--session-init`) and format (`--json`); `--json` bypasses Clack and
 * writes the typed result to stdout for harness consumption.
 *
 * The handler never exits non-zero on per-probe failure — the composite
 * shape carries per-slot errors so session-init can inspect the result and
 * decide what to do.
 *
 * @module
 */

import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as p from "@clack/prompts";
import { z } from "zod";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";

import {
  buildSessionInitStatusSummary,
  buildStatusSummary,
  runRecoverStatus,
  runSessionHandoffStatus,
  runSessionInitStatus,
  runStatus,
} from "../commands/status.js";
import type {
  CompactionSeedWriteStatus,
  SessionHandoffProbes,
  SessionInitProbes,
  StatusProbes,
} from "../commands/status.js";
import { runActiveStatus } from "../commands/active.js";
import {
  runConfigSessionInitStatus,
  runConfigStatus,
} from "../commands/config.js";
import { runDomainRulesSessionInitStatus } from "../commands/constitution.js";
import {
  runExtensionsSessionInitStatus,
  runExtensionsStatus,
} from "../commands/extensions.js";
import {
  runUserSessionInitStatus,
  runUserStatus,
} from "../commands/user.js";
import {
  filterRosterByIdentity,
  runIdentityScopedWorktreeRoster,
  runWorktreeRoster,
} from "../lib/git/index.js";
import { runRecentRemoteBranches } from "../lib/git/recent-remote-branches.js";
import {
  deriveInFlight,
  renderInFlightWarning,
  type InFlightEntry,
  type InFlightResidue,
  type InFlightWarning,
} from "../lib/git/in-flight-derivation.js";
import { findMaterializableWorkUnits } from "../lib/session-init/materializable-work-units.js";
import { pruneRemoteTrackingRefs } from "../lib/session-init/dead-ref-prune.js";
import {
  runBranchGoneRecovery,
  RECOVERY_RECENCY_DAYS,
} from "../lib/session-init/branch-gone-recovery.js";
import { runStaleWorktreeSweep } from "../lib/session-init/stale-worktree-sweep.js";
import { resolveCurrentHuskAdvisory } from "../lib/session-init/current-husk-advisory.js";
import { revalidateDecodedHuskRetirementEvidence } from "../lib/work-unit/teardown-retirement-driver.js";
import { runOrphanBranchSweep } from "../lib/session-init/orphan-branch-sweep.js";
import { runRetiredSubdirDetection } from "../lib/session-init/retired-subdir-detection.js";
import { runErrandStalenessSweep } from "../lib/session-init/errand-staleness-sweep.js";
import { runErrandState } from "../lib/session-init/errand-state.js";
import { runWorkUnitState } from "../lib/session-init/work-unit-state.js";
import { createGhWorkUnitPrSource } from "../lib/session-init/work-unit-pr-source.js";
import { runInboxState } from "../lib/session-init/inbox-state.js";
import { runPartialPushMarkerSurface } from "../lib/session-init/partial-push-marker-surface.js";
import { runNotesCompactionSessionAdvisory } from "../lib/session-init/notes-compaction-advisory.js";
import {
  runCurrentWuReconcileSessionProbe,
} from "../lib/session-init/current-wu-reconcile.js";
import { runDerivedLocusStateProbe } from "./derived-locus-state-probe.js";
import { extractReminderEntries } from "../lib/session-init/inbox-reminders.js";
import { shouldNudge, type NudgeMarkerState } from "../lib/session-init/nudge-rate-limit.js";
import { runDirtyStateStatus, type DirtyStateResult } from "../lib/git/dirty-state.js";
import { runHeadHashStatus } from "../lib/git/head-hash.js";
import { runPushabilityStatus } from "../lib/git/pushability.js";
import { runWorktreeSyncStatus } from "../lib/git/worktree-sync.js";
import { runBaseDrift } from "../lib/git/base-distance.js";
import { createCurrentBaseDriftAdapters } from "../lib/base-drift/current-adapters.js";
import { runBaseBranchSyncStatus } from "../lib/git/base-branch-sync.js";
import { detectSupersession } from "../lib/git/supersession.js";
import { resolveWorktreeIdentity } from "../lib/git/worktree-identity.js";
import { readWorktreeMarker } from "../lib/git/worktree-marker.js";
import { deriveRestateCandidates } from "../lib/handoff/restate-candidates.js";
import { resolveSessionNotesPath } from "../lib/handoff/session-notes-path.js";
import {
  resolveAllSettings,
  type ResolvedSettingsResult,
} from "../lib/config/resolved-settings.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { GitExec } from "../lib/git/index.js";
import { createGitExec, createUserIOContext, readGitBlobBytes } from "../lib/io-context.js";
import {
  projectTransientInFlightRead,
  readFetchedTransientInFlightIndexes,
  readTransientInFlightIndexes,
} from "../lib/errand/record.js";
import { resolveReleaseRouting } from "../lib/release/routing.js";
import type { ReleaseRoutingValue } from "../lib/release/routing.js";
import {
  emitCompactionSeed,
  parseUncommittedFiles,
  type CompactionSeedGitSnapshot,
  type EmitCompactionSeedResult,
} from "../lib/compaction-seed/emitter.js";
import { assembleStatusUserView } from "../lib/status/assemble-user-view.js";
import {
  composeProjectReadinessViewResult,
  resolveProjectReadinessRenderStamp,
  resolveProjectReadinessViewInput,
  type ProjectReadinessWarning,
} from "../lib/status/project-view.js";
import {
  renderRoadmapFromIndexViewResult,
  resolveStagedRetirementTransitionOverlay,
} from "../lib/status/roadmap-regeneration-assert.js";
import {
  assertSessionInitProbeResult,
  assertSessionRecoverProbeResult,
} from "../commands/status/schema.js";
import { resolveUserSurfaceResolver, type UserSurfaceResolver } from "../lib/user-surfaces.js";
import {
  projectUserReferenceSessionResult,
  resolveUserReferenceAuthority,
} from "../lib/user-reference-reconcile.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { buildLifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import {
  enumerateGitRetirementRecords,
  queryGitRetirementDisposition,
} from "../lib/work-unit/git-retirement-record-enumeration.js";
import { listCurrentWuArtifactPaths } from "../lib/work-unit/reference-reconcile.js";
import { resolveComposedLifecycleIndex } from "../lib/work-unit/composed-lifecycle-index.js";
import { resolveSlugQuery, type SlugStateQuery } from "../lib/work-unit/lifecycle-query.js";
import { listParkedSlugs } from "../lib/work-unit/lifecycle-resolver.js";
import { transitionOverlayCompositionInput } from "../lib/work-unit/transition-overlay.js";
import { createRecoverStatusProbes } from "./recover-probes.js";
import { readIdentityPointers } from "./identity-pointers.js";
import { requireArcProjectRoot } from "./shared.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";

export interface StatusCliOptions {
  sessionInit?: boolean;
  sessionHandoff?: boolean;
  recover?: boolean;
  user?: boolean;
  project?: boolean;
  /** `--local`: render explicit user/project views from local refs without a network read. */
  local?: boolean;
  /** `--staged`: render the `--project` view's tree inputs from the git index (the pre-commit regen source). */
  staged?: boolean;
  /** `true` opts a slug query into live membership; `false` skips network reads for live-default views. */
  fetch?: boolean;
  json?: boolean;
  /** With --session-init: write the machine-local compaction seed sidecar. */
  writeCompactionSeed?: boolean;
}

/** Validated composite status mode and optional subject. */
export const StatusCommandInputSchema = z.object({
  slug: SlugSchema.optional(),
  sessionInit: z.boolean().optional(),
  sessionHandoff: z.boolean().optional(),
  recover: z.boolean().optional(),
  user: z.boolean().optional(),
  project: z.boolean().optional(),
  local: z.boolean().optional(),
  staged: z.boolean().optional(),
  fetch: z.boolean().optional(),
  json: z.boolean().optional(),
  writeCompactionSeed: z.boolean().optional(),
}).strict().superRefine((value, refinement) => {
  const modes = [value.slug !== undefined, value.sessionInit, value.sessionHandoff, value.recover, value.user, value.project]
    .filter(Boolean).length;
  if (modes > 1) {
    refinement.addIssue({
      code: "custom",
      message: "A status <slug> query, --session-init, --session-handoff, --recover, --user, and --project are mutually exclusive.",
    });
  }
  if (value.writeCompactionSeed === true && value.sessionInit !== true) {
    refinement.addIssue({ code: "custom", path: ["writeCompactionSeed"], message: "Requires --session-init." });
  }
  if (value.staged === true && value.project !== true) {
    refinement.addIssue({ code: "custom", path: ["staged"], message: "Requires --project." });
  }
});

/** Registry contribution owned by composite status. */
export const statusCommandInputRegistration = {
  commandPath: "status",
  schema: StatusCommandInputSchema,
  schemaFields: {
    "operand.slug": "slug",
    "option.session-init": "sessionInit",
    "option.session-handoff": "sessionHandoff",
    "option.recover": "recover",
    "option.user": "user",
    "option.project": "project",
    "option.local": "local",
    "option.no-fetch": "fetch",
    "option.staged": "staged",
    "option.fetch": "fetch",
    "option.json": "json",
    "option.write-compaction-seed": "writeCompactionSeed",
  },
} satisfies CommandInputRegistration;

/** Machine-output policies owned by the status adapter. */
export const statusCommandInputPolicyDeclarations = [{
  commandPath: "status",
  aliases: [],
  sites: ([
    ["json", "json"], ["recover", "recover"], ["session-handoff", "sessionHandoff"],
    ["session-init", "sessionInit"],
  ] as const).map(([option, schemaField]) => declareCliOptionSite(option, {
    acquisition: "machine-mode", schemaOwnership: "owned", schemaField,
    cancellation: "not-applicable", automation: { noInput: "same", flags: [`--${option}`], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })).concat({
    id: "semantic.interaction-context",
    source: { file: "handlers/status.ts", symbol: "handleStatus" },
    origin: "declaration",
    acquisition: "derived",
    schemaOwnership: "none",
    derivationSource: "shared InteractionContext",
    cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--no-input", "--json"], acceptedSyntax: [] },
    mutationBoundary: "status probe orchestration",
    subprocess: "terminal-prompts",
  }),
}] satisfies readonly CommandInputDeclaration[];

function writeProjectReadinessWarnings(warnings: readonly ProjectReadinessWarning[]): void {
  for (const warning of warnings) process.stderr.write(`warning: ${warning.rendered}\n`);
}

function releaseRoutingFromSettings(settings: ResolvedSettingsResult): ReleaseRoutingValue {
  return resolveReleaseRouting({
    releaseOptedIn: settings.resolved.releaseOptedIn.value === "true",
    commitInterlock: settings.resolved.commitInterlock.value,
    pushInterlock: settings.resolved.pushInterlock.value,
  });
}

const ERRAND_NUDGE_MARKER_RELATIVE = ".internal/errand-reminder-last-nudge.txt";

/**
 * Marker for the work-unit staleness nudge — a separate per-user file from the
 * errand reminder so the two batch independently (the errand reminder clears at
 * housekeep; WU staleness clears when the WU merges / archives).
 */
const WORK_UNIT_STALE_NUDGE_MARKER_RELATIVE = ".internal/work-unit-stale-last-nudge.txt";
const NOTES_COMPACTION_NUDGE_MARKER_RELATIVE = ".internal/notes-compaction-last-nudge.txt";

function parsePositiveInteger(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Resolve once-per-calendar-day marker state for a batched session-init nudge
 * from its per-user marker file. Shared across the rate-limited surfaces (errand
 * reminder / stale-errand, work-unit staleness) — each passes its own
 * `markerRelative` so the surfaces batch independently.
 */
async function resolveNudgeState(
  cwd: string,
  io: ReturnType<typeof createUserIOContext>,
  identity: string | null,
  markerRelative: string,
  resolveSurfaces?: (identity: string) => Promise<UserSurfaceResolver>,
): Promise<NudgeMarkerState> {
  const today = new Date().toISOString().slice(0, 10);
  if (identity === null) {
    return { shouldNudge: false, markerPath: null, today };
  }
  const surfaces = resolveSurfaces !== undefined
    ? await resolveSurfaces(identity)
    : await resolveUserSurfaceResolver({ cwd, identity: SlugSchema.parse(identity), exec: io.exec });
  const markerPath = surfaces.identityGlobalDisplayPath(markerRelative);
  const absoluteMarkerPath = surfaces.identityGlobalPath(markerRelative);
  const lastNudge = await io.readFile(absoluteMarkerPath).then(
    (content) => content.trim(),
    () => null,
  );
  return {
    shouldNudge: shouldNudge({ lastNudge, today }),
    markerPath,
    today,
  };
}

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
  const json = Boolean(opts.json);

  if (slug !== undefined) {
    // Slug→state query: a subject-keyed read over the lifecycle-complete index.
    // The index walk binds real I/O; the resolution stays a pure lib projection.
    // Transient identities still feed the oracle so recorded Errand
    // branches are not mis-emitted as `no-record-or-meta` residue.
    const { settings } = await readConfigSettings(cwd);
    const { identity } = await readIdentityPointers(exec);
    const transient = projectTransientInFlightRead(
      await readTransientInFlightIndexes({ exec, identity }),
    );
    const composed = await resolveComposedLifecycleIndex({
      cwd,
      fs: {
        readdir: (path) => readdir(path, { withFileTypes: true }),
        readFile: (path) => readFile(path, "utf8"),
      },
      oracle: {
        exec,
        decompositionClaimCwd: cwd,
        localOnly: opts.fetch !== true,
        baseBranch: settings["branch.base"],
        errandSlugByBranch: transient.indexes.slugByBranch,
        errandRecordsComplete: transient.complete,
      },
    });
    const query = resolveSlugQuery(composed.index, slug);
    const worktreePath = composed.worktreePathBySlug.get(slug);
    const warnings = [
      ...composed.qualityFacts.warnings.map(renderInFlightWarning),
      ...(opts.fetch === true && composed.qualityFacts.unreachable === true
        ? ["Remote unreachable; query derived from local refs only."]
        : []),
    ];
    const output = {
      ...query,
      ...(worktreePath !== undefined ? { worktreePath } : {}),
      ...(warnings.length > 0 ? { warnings: [...new Set(warnings)] } : {}),
    };
    if (json) {
      process.stdout.write(`${JSON.stringify(output)}\n`);
      return;
    }
    p.intro("arc status");
    p.note(formatSlugStateQuery(query, { worktreePath, warnings: output.warnings ?? [] }), "Lifecycle state");
    p.outro("Done.");
    return;
  }

  const lifecycleFs = {
    readdir: (path: string) => readdir(path, { withFileTypes: true }),
    readFile: (path: string) => readFile(path, "utf8"),
  };
  const io = createUserIOContext(interaction?.subprocess);
  const { identity, role } = await readIdentityPointers(exec);
  const userSurfaceResolvers = new Map<string, ReturnType<typeof resolveUserSurfaceResolver>>();
  const userSurfacesFor = (id: string): Promise<UserSurfaceResolver> => {
    let resolver = userSurfaceResolvers.get(id);
    if (resolver === undefined) {
      resolver = resolveUserSurfaceResolver({ cwd, identity: SlugSchema.parse(id), exec });
      userSurfaceResolvers.set(id, resolver);
    }
    return resolver;
  };
  // Both the inbox-state and reminder-sweep probes read the same personal
  // `USER-INBOX.md`; a missing file reads as empty (no captures).
  const readUserInbox = (id: string): Promise<string> =>
    userSurfacesFor(id)
      .then((surfaces) => io.readFile(surfaces.identityGlobalPath("USER-INBOX.md")))
      .catch(() => "");

  if (opts.sessionHandoff) {
    if (!json) {
      process.stderr.write(
        "Error: --session-handoff currently requires --json (interactive rendering not yet implemented).\n",
      );
      process.exitCode = 1;
      return;
    }
    // Cache the resolution promise instead of awaiting eagerly: a thrown
    // settings-resolution error now surfaces through the orchestrator's typed
    // per-probe Result channel rather than aborting the whole
    // command and breaking the composite-result contract. The mode-validation
    // early-return above runs first to avoid leaving an unawaited rejection on
    // the non-JSON exit path.
    const resolvedSettingsP = resolveAllSettings({ cwd, exec, readFile: io.readFile });
    const probes: SessionHandoffProbes = {
      derivedLocusState: async (id, activeExtensions) => {
        const resolved = await resolvedSettingsP;
        return runDerivedLocusStateProbe({
          cwd,
          identity: id,
          baseBranch: resolved.settings["branch.base"],
          activeExtensions,
          exec,
        });
      },
      extensions: () => runExtensionsSessionInitStatus({ cwd }),
      dirty: () => runDirtyStateStatus({ exec }),
      worktree: async () => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runWorktreeSyncStatus({ exec, remoteSyncEnabled });
      },
      user: async (id) => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runUserSessionInitStatus({ cwd, io, identity: id, remoteSyncEnabled });
      },
      syncInterlock: async () => {
        // syncInterlock is per-developer-only; the generic resolver type
        // still permits a "yaml" source, but no runtime path produces it
        // for this key. Coerce defensively to keep HandoffSyncInterlock's
        // narrower source union honest.
        const resolved = (await resolvedSettingsP).resolved.syncInterlock;
        const source = resolved.source === "yaml" ? "default" : resolved.source;
        return { value: resolved.value, source };
      },
      head: () => runHeadHashStatus({ exec }),
      pushability: () => runPushabilityStatus({
        exec,
        access,
        target: "worktree",
      }),
      restateCandidates: async () => {
        let sessionNotes: string | null = null;
        if (identity !== null) {
          const path = await resolveSessionNotesPath(cwd, identity, io);
          if (path !== null) {
            sessionNotes = await io.readFile(path).catch(() => null);
          }
        }
        return deriveRestateCandidates({ exec, sessionNotes });
      },
      releaseRouting: async () => releaseRoutingFromSettings(await resolvedSettingsP),
      inboxState: async (id) => runInboxState({ content: await readUserInbox(id) }),
    };
    // Do not await userSurfacesFor here: a rejection would abort the composite
    // before safeProbe handling. Resolution runs inside runSessionHandoffStatus
    // under safeProbe("pathSet", …) so failures stay slot-wise in the envelope.
    // Discriminated options: resolver required iff identity is non-null.
    const result = identity === null
      ? await runSessionHandoffStatus({ identity: null, role, probes })
      : await runSessionHandoffStatus({
        identity,
        role,
        probes,
        resolveHandoffSurfaces: async () => {
          const surfaces = await userSurfacesFor(identity);
          return {
            workingMemoryPath: surfaces.workingMemoryPath,
            sessionNotesPath: (workUnitName: string) =>
              surfaces.sessionNotesPath(SlugSchema.parse(workUnitName)),
          };
        },
      });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (opts.recover) {
    if (!json) {
      process.stderr.write(
        "Error: --recover currently requires --json (interactive rendering not implemented).\n",
      );
      process.exitCode = 1;
      return;
    }
    const result = await runRecoverStatus({
      identity,
      role,
      probes: createRecoverStatusProbes({
        cwd,
        dirty: () => runDirtyStateStatus({ exec }),
      }),
      workingMemoryPath: identity === null ? null : (await userSurfacesFor(identity)).workingMemoryPath,
    });
    assertSessionRecoverProbeResult(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (opts.sessionInit) {
    // See sessionHandoff branch above for the rationale on caching the
    // resolution promise rather than awaiting eagerly.
    const resolvedSettingsP = resolveAllSettings({ cwd, exec, readFile: io.readFile });
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
    const getOptionalDerivedRoster = async () => {
      if (identity === null) return null;
      try {
        return (await getDerivedLocusState(identity)).roster;
      } catch {
        return null;
      }
    };
    const compactionSeedGitSnapshotP = opts.writeCompactionSeed
      ? readCompactionSeedGitSnapshot(cwd, exec)
      : null;
    // Shared in-flight oracle slice — the bounded network read (live remote
    // membership → pruned-ref derivation) feeding both the errand-state and
    // materializable-WU probes. Both gate on the no-active-WU arm, so when one
    // fires the other does too; memoizing keeps it a single read. Lazy: a resume
    // session forces neither probe, so the network read never runs there.
    let oraclePromise: Promise<{
      entries: InFlightEntry[];
      residue: InFlightResidue[];
      warnings: InFlightWarning[];
      remoteTips: Map<string, string>;
      reachable: boolean;
    }> | undefined;
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
    const getOracle = (): Promise<{
      entries: InFlightEntry[];
      residue: InFlightResidue[];
      warnings: InFlightWarning[];
      remoteTips: Map<string, string>;
      reachable: boolean;
    }> => {
      oraclePromise ??= (async () => {
        // Fire the dead-ref prune before derivation so every oracle caller
        // observes the same pruned ref set, regardless of call order.
        await pruneRemoteTrackingRefs(exec);
        const resolved = await resolvedSettingsP;
        const teamMode = resolved.settings["team.mode"] === "true";
        const [transientRead, parkedSlugs, derivedRoster] = await Promise.all([
          getDiscoveryTransientIndexes(),
          buildLifecycleIndex({ cwd, fs: lifecycleFs }).then(listParkedSlugs),
          getOptionalDerivedRoster(),
        ]);
        const transient = projectTransientInFlightRead(transientRead);
        const transientIndexes = transient.indexes;
        const result = await deriveInFlight({
          exec,
          decompositionClaimCwd: cwd,
          localOnly: false,
          baseBranch: resolved.settings["branch.base"],
          identity,
          teamMode,
          errandSlugByBranch: transientIndexes.slugByBranch,
          expectedTransientByBranch: transientIndexes.expectedByBranch,
          errandRecordsComplete: transient.complete,
          parkedSlugs,
          derivedRoster,
        });
        // Unreachable: derive nothing rather than a half-resolved view over
        // un-pruned local refs. Consumers surface no candidates / skip discovery.
        if (!result.reachable) {
          return {
            entries: [],
            residue: result.residue,
            warnings: result.warnings,
            remoteTips: new Map(),
            reachable: false,
          };
        }
        return {
          entries: result.entries,
          residue: result.residue,
          warnings: result.warnings,
          remoteTips: new Map(Object.entries(result.liveRefs).flatMap(([ref, tip]) => {
            const prefix = "origin/";
            return ref.startsWith(prefix) ? [[ref.slice(prefix.length), tip]] : [];
          })),
          reachable: result.reachable,
        };
      })();
      return oraclePromise;
    };
    const probes: SessionInitProbes = {
      derivedLocusState: async (id, activeExtensions) => {
        return getDerivedLocusState(id, activeExtensions);
      },
      user: async (id) => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runUserSessionInitStatus({ cwd, io, identity: id, remoteSyncEnabled });
      },
      worktree: async () => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runWorktreeSyncStatus({ exec, remoteSyncEnabled });
      },
      worktreeIdentity: () => resolveWorktreeIdentity(exec),
      currentHusk: async (worktreePath) => {
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
          return await revalidateDecodedHuskRetirementEvidence(
            exec,
            stamp,
            decoded,
            resolved.settings["branch.protection"] === "full" ? `origin/${baseBranch}` : baseBranch,
            (ref, path) => readGitBlobBytes(cwd, ref, path),
          );
        });
      },
      baseDistance: async () => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runBaseDrift({
          exec,
          baseBranch: resolved.settings["branch.base"],
          mode: "advisory",
          remoteSyncEnabled,
          ...createCurrentBaseDriftAdapters(exec),
        });
      },
      baseBranchSync: async () => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runBaseBranchSyncStatus({
          exec,
          baseBranch: resolved.settings["branch.base"],
          remoteSyncEnabled,
        });
      },
      supersession: (branch) => detectSupersession({ exec, branch }),
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
            queryDisposition: (input) => queryGitRetirementDisposition(exec, "HEAD", input),
            enumerateRetirementRecords: () => enumerateGitRetirementRecords(exec, "HEAD"),
            listArtifactPaths: (slug, ownedMetaPath) =>
              listCurrentWuArtifactPaths(slug, ownedMetaPath, (path) => readdir(resolve(cwd, path))),
            readFile: (path) => io.readFile(resolve(cwd, path)),
          },
          { slug, metaPath },
        ),
      userReferenceReconcile: async ({ slug }) => {
        if (identity === null) throw new Error("User-reference probe requires an identity.");
        const resolved = await resolvedSettingsP;
        const surfaces = await userSurfacesFor(identity);
        const authority = await resolveUserReferenceAuthority({
          protection: resolved.settings["branch.protection"] === "full" ? "full" : "partial",
          baseBranch: resolved.settings["branch.base"],
          refreshRemoteBase: async () => {
            try {
              await exec("git", ["fetch", "origin", resolved.settings["branch.base"]]);
              await exec("git", [
                "rev-parse",
                "--verify",
                "--quiet",
                `origin/${resolved.settings["branch.base"]}`,
              ]);
              return true;
            } catch {
              return false;
            }
          },
          enumerateAt: (ref) => enumerateGitRetirementRecords(exec, ref),
        });
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
      recovery: async (roster, currentBranch) => {
        const resolved = await resolvedSettingsP;
        const recentBranches = await runRecentRemoteBranches({
          exec,
          withinDays: RECOVERY_RECENCY_DAYS,
        });
        return runBranchGoneRecovery({
          roster,
          currentBranch,
          baseBranch: resolved.settings["branch.base"],
          recentBranches,
          exec,
        });
      },
      sweep: async (roster, worktreeIdentity) => {
        const [resolved, derivedRoster] = await Promise.all([
          resolvedSettingsP,
          getOptionalDerivedRoster(),
        ]);
        return runStaleWorktreeSweep({
          roster,
          worktreeIdentity,
          baseBranch: resolved.settings["branch.base"],
          exec,
          identity,
          teamMode: resolved.settings["team.mode"] === "true",
          protection: resolved.settings["branch.protection"] === "full" ? "full" : "partial",
          excludeWorktreePath: worktreeIdentity.kind === "linked" ? worktreeIdentity.path : undefined,
          readBlob: (ref, path) => readGitBlobBytes(cwd, ref, path),
          derivedRoster,
        });
      },
      orphanBranchSweep: async (worktreeIdentity) => {
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
          errandBranches:
            transient === null || !transient.complete
              ? null
              : new Set(transient.indexes.slugByBranch.keys()),
          exec,
          derivedRoster,
        });
      },
      retiredSubdirs: async (id) => {
        const resolved = await resolvedSettingsP;
        return runRetiredSubdirDetection({
          cwd,
          identity: id,
          baseBranch: resolved.settings["branch.base"],
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
      errandState: async (input) => {
        const resolved = await resolvedSettingsP;
        const thresholdDays = parsePositiveInteger(resolved.settings["inbox.remind_after_days"], 1);
        const transientRead = await (input.includeDiscovery
          ? getDiscoveryTransientIndexes()
          : getTransientIndexes());
        const transientState = projectTransientInFlightRead(transientRead);
        const transientIndexes = transientState.indexes;
        let entries: InFlightEntry[] | null = null;
        let residue: InFlightResidue[] = [];
        let remoteTips = new Map<string, string>();
        let oracleWarnings: string[] = transientState.degraded === null ? [] : [transientState.degraded];
        if (input.includeDiscovery) {
          const oracle = await getOracle();
          entries = oracle.reachable ? oracle.entries : null;
          residue = oracle.residue;
          remoteTips = oracle.remoteTips;
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
          baseBranch: resolved.settings["branch.base"],
          staleThresholdDays: thresholdDays,
          nudge: await resolveNudgeState(cwd, io, identity, ERRAND_NUDGE_MARKER_RELATIVE, userSurfacesFor),
        });
      },
      materializableWorkUnits: async () => {
        const { entries, warnings, reachable } = await getOracle();
        const renderedWarnings = warnings.map(renderInFlightWarning);
        if (!reachable) return { candidates: [], warnings: renderedWarnings };
        return { ...findMaterializableWorkUnits({ entries, identity }), warnings: renderedWarnings };
      },
      workUnitState: async (input) => {
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

  if (opts.user) {
    const resolved = await resolveAllSettings({ cwd, exec, readFile: io.readFile });
    const teamMode = resolved.settings["team.mode"] === "true";
    const localOnly = Boolean(opts.local) || opts.fetch === false;
    const parkedSlugs = listParkedSlugs(await buildLifecycleIndex({ cwd, fs: lifecycleFs }));
    const view = await assembleStatusUserView({
      cwd,
      exec,
      identity,
      teamMode,
      localOnly,
      baseBranch: resolved.settings["branch.base"],
      parkedSlugs,
      readFile: io.readFile,
      writeFile: io.writeFile,
      mkdir: (path, options) => io.mkdir(path, options).then(() => undefined),
    });
    if (json) {
      process.stdout.write(`${JSON.stringify(view)}\n`);
      return;
    }
    process.stdout.write(`${view.output}\n`);
    return;
  }

  if (opts.project) {
    const resolved = await resolveAllSettings({ cwd, exec, readFile: io.readFile });
    if (opts.staged) {
      // Render the project view from the git index — the same source the
      // pre-commit ROADMAP regen check validates against, so
      // `arc status --project --staged > ROADMAP` produces exactly what the
      // hook expects (staged sweep or clean tree).
      const transitionOverlay = await resolveStagedRetirementTransitionOverlay({ cwd, exec });
      const { result } = await renderRoadmapFromIndexViewResult({
        cwd,
        exec,
        baseBranch: resolved.settings["branch.base"],
        ...(transitionOverlay === undefined
          ? {}
          : { transitionOverlay: transitionOverlayCompositionInput(transitionOverlay) }),
      });
      if (json) {
        process.stdout.write(`${JSON.stringify(result)}\n`);
        return;
      }
      writeProjectReadinessWarnings(result.warnings);
      process.stdout.write(`${result.markdown}\n`);
      return;
    }
    const localOnly = Boolean(opts.local) || opts.fetch === false;
    const [parkedSlugs, transientRead] = await Promise.all([
      buildLifecycleIndex({ cwd, fs: lifecycleFs }).then(listParkedSlugs),
      readTransientInFlightIndexes({ exec, identity }),
    ]);
    const transient = projectTransientInFlightRead(transientRead);
    const input = await resolveProjectReadinessViewInput({
      cwd,
      fs: lifecycleFs,
      oracle: {
        exec,
        decompositionClaimCwd: cwd,
        localOnly,
        baseBranch: resolved.settings["branch.base"],
        parkedSlugs,
        errandSlugByBranch: transient.indexes.slugByBranch,
        errandRecordsComplete: transient.complete,
      },
    });
    const result = composeProjectReadinessViewResult({
      ...input,
      renderedRef: await resolveProjectReadinessRenderStamp({
        exec,
        cwd,
        scope: localOnly ? "tree + local refs" : "tree + live refs",
        liveView: "arc status --project",
      }),
    });
    if (json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    writeProjectReadinessWarnings(result.warnings);
    process.stdout.write(`${result.markdown}\n`);
    return;
  }

  const probes: StatusProbes = {
    user: (id) => runUserStatus({ cwd, io, identity: id }),
    extensions: () => runExtensionsStatus({ cwd }),
    config: () => runConfigStatus({ cwd }),
    active: () => runActiveStatus({ cwd }),
  };
  const result = await runStatus({ identity, role, probes });

  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  p.intro("arc status");
  p.note(buildStatusSummary(result), "Status");
  p.outro("Done.");
}

async function readCompactionSeedGitSnapshot(cwd: string, exec: GitExec): Promise<CompactionSeedGitSnapshot> {
  const [headResult, statusResult] = await Promise.all([
    exec("git", ["rev-parse", "HEAD"], { cwd }),
    exec("git", ["status", "--porcelain=v1", "-z"], { cwd }),
  ]);
  return {
    head: headResult.stdout.trim(),
    uncommittedFiles: parseUncommittedFiles(statusResult.stdout),
  };
}

function dirtyStateFromCompactionSeedSnapshot(snapshot: CompactionSeedGitSnapshot) {
  const fileCount = snapshot.uncommittedFiles.length;
  return {
    state: fileCount === 0 ? "clean" as const : "dirty" as const,
    fileCount,
  };
}

export async function resolveSessionInitDirtyState(options: {
  compactionSeedGitSnapshotP: Promise<CompactionSeedGitSnapshot> | null;
  fallback: () => Promise<DirtyStateResult>;
}): Promise<DirtyStateResult> {
  if (options.compactionSeedGitSnapshotP === null) {
    return options.fallback();
  }
  try {
    return dirtyStateFromCompactionSeedSnapshot(await options.compactionSeedGitSnapshotP);
  } catch {
    return options.fallback();
  }
}

function summarizeCompactionSeedWrite(result: EmitCompactionSeedResult): CompactionSeedWriteStatus {
  if (result.status === "written") {
    return { status: "written", path: result.path };
  }
  return result;
}

function surfaceCompactionSeedWrite(result: CompactionSeedWriteStatus): void {
  if (result.status === "failed") {
    process.stderr.write(`warn: compaction seed not written (${result.reason}): ${result.message}\n`);
  }
  if (result.status === "skipped" && result.reason === "identity-missing") {
    process.stderr.write("warn: compaction seed not written: identity not configured\n");
  }
  if (result.status === "skipped" && result.reason === "load-set-unresolved") {
    process.stderr.write("warn: compaction seed not written: load-set unresolved\n");
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Compact human render of a slug→state query for the non-`--json` path. */
function formatSlugStateQuery(
  query: SlugStateQuery,
  enrichment: { worktreePath?: string; warnings?: readonly string[] } = {},
): string {
  const position =
    query.position === null
      ? "—"
      : `${query.position.phase} · ${query.position.location}`;
  const lines = [
    `${query.slug} → ${query.state}`,
    `position: ${position}`,
    `occupied: ${query.occupied} · shipped: ${query.shipped}`,
  ];
  if (enrichment.worktreePath !== undefined) lines.push(`worktree: ${enrichment.worktreePath}`);
  if (query.dependsOn.length > 0) {
    lines.push("depends on:");
    for (const dep of query.dependsOn) {
      lines.push(`  - ${dep.slug} — ${dep.landed ? "landed" : "not landed"}`);
    }
  }
  for (const warning of enrichment.warnings ?? []) lines.push(`warning: ${warning}`);
  return lines.join("\n");
}
