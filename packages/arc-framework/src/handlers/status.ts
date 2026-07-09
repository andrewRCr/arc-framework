/**
 * Handler for `arc status` — the composite probe orchestrator.
 *
 * Reads `arc.identity` / `arc.role` via two parallel `git config` calls,
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

import * as p from "@clack/prompts";

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
import {
  runActiveSessionInitStatus,
  runActiveStatus,
} from "../commands/active.js";
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
  gitConfigGet,
  runWorktreeRoster,
} from "../lib/git/index.js";
import { runRecentRemoteBranches } from "../lib/git/recent-remote-branches.js";
import {
  deriveInFlight,
  renderInFlightWarning,
  type InFlightEntry,
  type InFlightWarning,
} from "../lib/git/in-flight-derivation.js";
import { findMaterializableWorkUnits } from "../lib/session-init/materializable-work-units.js";
import { pruneRemoteTrackingRefs } from "../lib/session-init/dead-ref-prune.js";
import {
  runBranchGoneRecovery,
  RECOVERY_RECENCY_DAYS,
} from "../lib/session-init/branch-gone-recovery.js";
import { runStaleWorktreeSweep } from "../lib/session-init/stale-worktree-sweep.js";
import { runPlanOrphanSweep } from "../lib/session-init/plan-orphan-sweep.js";
import { runRetiredSubdirDetection } from "../lib/session-init/retired-subdir-detection.js";
import { runErrandStalenessSweep } from "../lib/session-init/errand-staleness-sweep.js";
import { runErrandState } from "../lib/session-init/errand-state.js";
import { runWorkUnitState } from "../lib/session-init/work-unit-state.js";
import { createGhWorkUnitPrSource } from "../lib/session-init/work-unit-pr-source.js";
import { runInboxState } from "../lib/session-init/inbox-state.js";
import { runPartialPushMarkerSurface } from "../lib/session-init/partial-push-marker-surface.js";
import { runNotesCompactionSessionAdvisory } from "../lib/session-init/notes-compaction-advisory.js";
import { resolveActiveCohortDocPath } from "../lib/session-init/cohort-doc.js";
import { extractReminderEntries } from "../lib/session-init/inbox-reminders.js";
import { shouldNudge, type NudgeMarkerState } from "../lib/session-init/nudge-rate-limit.js";
import { runDirtyStateStatus, type DirtyStateResult } from "../lib/git/dirty-state.js";
import { runHeadHashStatus } from "../lib/git/head-hash.js";
import { runPushabilityStatus } from "../lib/git/pushability.js";
import { runWorktreeSyncStatus } from "../lib/git/worktree-sync.js";
import { runBaseDistanceStatus } from "../lib/git/base-distance.js";
import { runBaseBranchSyncStatus } from "../lib/git/base-branch-sync.js";
import { detectSupersession } from "../lib/git/supersession.js";
import { resolveWorktreeIdentity } from "../lib/git/worktree-identity.js";
import { deriveRestateCandidates } from "../lib/handoff/restate-candidates.js";
import { resolveSessionNotesPath } from "../lib/handoff/session-notes-path.js";
import {
  resolveAllSettings,
  type ResolvedSettingsResult,
} from "../lib/config/resolved-settings.js";
import { createUserIOContext, gitExec } from "../lib/io-context.js";
import { listErrandRecords, type ErrandRecord } from "../lib/errand/record.js";
import { resolveReleaseRouting } from "../lib/release/routing.js";
import type { ReleaseRoutingValue } from "../lib/release/routing.js";
import {
  emitCompactionSeed,
  parseUncommittedFiles,
  type CompactionSeedGitSnapshot,
  type EmitCompactionSeedResult,
} from "../lib/compaction-seed/emitter.js";
import { assembleStatusUserView } from "../lib/status/assemble-user-view.js";
import { resolveTaskListCursorFromFile } from "../lib/task-list/file-cursor.js";
import { resolveUserSurfaceResolver, type UserSurfaceResolver } from "../lib/user-surfaces.js";
import { buildLifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { resolveSlugQuery, type SlugStateQuery } from "../lib/work-unit/lifecycle-query.js";
import { listParkedSlugs } from "../lib/work-unit/lifecycle-resolver.js";
import { createRecoverStatusProbes } from "./recover-probes.js";
import { requireArcProjectRoot } from "./shared.js";

export interface StatusCliOptions {
  sessionInit?: boolean;
  sessionHandoff?: boolean;
  recover?: boolean;
  user?: boolean;
  /** `--local`: render the user view from local refs without a network read. */
  local?: boolean;
  /** Commander's negation of `--no-fetch` (defaults to `true`); `false` skips the network read. */
  fetch?: boolean;
  json?: boolean;
  /** With --session-init: write the machine-local compaction seed sidecar. */
  writeCompactionSeed?: boolean;
}

/** Normalize a `git config` readback — `undefined`, empty, and whitespace-only become `null`. */
export function normalizeGitConfigValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

async function readIdentityPointers(): Promise<{
  identity: string | null;
  role: string | null;
}> {
  const [identityRaw, roleRaw] = await Promise.all([
    gitConfigGet(gitExec, "arc.identity"),
    gitConfigGet(gitExec, "arc.role"),
  ]);
  return {
    identity: normalizeGitConfigValue(identityRaw),
    role: normalizeGitConfigValue(roleRaw),
  };
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
    : await resolveUserSurfaceResolver({ cwd, identity, exec: io.exec });
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

export async function handleStatus(slug: string | undefined, opts: StatusCliOptions): Promise<void> {
  const modeCount = [
    slug !== undefined,
    opts.sessionInit,
    opts.sessionHandoff,
    opts.recover,
    opts.user,
  ].filter(Boolean).length;
  if (modeCount > 1) {
    process.stderr.write(
      "Error: a status <slug> query, --session-init, --session-handoff, --recover, and --user are mutually exclusive.\n",
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
    // Slug→state query: a subject-keyed read over the lifecycle-complete index,
    // independent of session identity / settings. The index walk binds real I/O;
    // the resolution stays a pure lib projection.
    const index = await buildLifecycleIndex({
      cwd,
      fs: {
        readdir: (path) => readdir(path, { withFileTypes: true }),
        readFile: (path) => readFile(path, "utf8"),
      },
    });
    const query = resolveSlugQuery(index, slug);
    if (json) {
      process.stdout.write(`${JSON.stringify(query)}\n`);
      return;
    }
    p.intro("arc status");
    p.note(formatSlugStateQuery(query), "Lifecycle state");
    p.outro("Done.");
    return;
  }

  const lifecycleFs = {
    readdir: (path: string) => readdir(path, { withFileTypes: true }),
    readFile: (path: string) => readFile(path, "utf8"),
  };
  const io = createUserIOContext();
  const { identity, role } = await readIdentityPointers();
  const userSurfaceResolvers = new Map<string, ReturnType<typeof resolveUserSurfaceResolver>>();
  const userSurfacesFor = (id: string): Promise<UserSurfaceResolver> => {
    let resolver = userSurfaceResolvers.get(id);
    if (resolver === undefined) {
      resolver = resolveUserSurfaceResolver({ cwd, identity: id, exec: gitExec });
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
    // settings-resolution error now surfaces as a per-probe failure (via the
    // orchestrator's `safeProbe` wrapper) rather than aborting the whole
    // command and breaking the composite-result contract. The mode-validation
    // early-return above runs first to avoid leaving an unawaited rejection on
    // the non-JSON exit path.
    const resolvedSettingsP = resolveAllSettings({ cwd, exec: gitExec, readFile: io.readFile });
    const probes: SessionHandoffProbes = {
      dirty: () => runDirtyStateStatus({ exec: gitExec }),
      worktree: async () => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runWorktreeSyncStatus({ exec: gitExec, remoteSyncEnabled });
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
      active: (id, r) => runActiveSessionInitStatus({ cwd, identity: id, role: r, exec: gitExec }),
      head: () => runHeadHashStatus({ exec: gitExec }),
      pushability: () => runPushabilityStatus({
        exec: gitExec,
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
        return deriveRestateCandidates({ exec: gitExec, sessionNotes });
      },
      releaseRouting: async () => releaseRoutingFromSettings(await resolvedSettingsP),
      inboxState: async (id) => runInboxState({ content: await readUserInbox(id) }),
    };
    const result = await runSessionHandoffStatus({ identity, role, probes });
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
        dirty: () => runDirtyStateStatus({ exec: gitExec }),
      }),
      identityGlobalUserDir: identity === null ? null : (await userSurfacesFor(identity)).identityGlobalRoot,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (opts.sessionInit) {
    // See sessionHandoff branch above for the rationale on caching the
    // resolution promise rather than awaiting eagerly.
    const resolvedSettingsP = resolveAllSettings({ cwd, exec: gitExec, readFile: io.readFile });
    const compactionSeedGitSnapshotP = opts.writeCompactionSeed
      ? readCompactionSeedGitSnapshot(cwd)
      : null;
    // Shared in-flight oracle slice — the bounded network read (live remote
    // membership → pruned-ref derivation) feeding both the errand-state and
    // materializable-WU probes. Both gate on the no-active-WU arm, so when one
    // fires the other does too; memoizing keeps it a single read. Lazy: a resume
    // session forces neither probe, so the network read never runs there.
    let oraclePromise: Promise<{
      entries: InFlightEntry[];
      warnings: InFlightWarning[];
      reachable: boolean;
    }> | undefined;
    // Errand records — the errand-identity oracle, shared by the in-flight
    // derivation (errand-vs-WU classification) and the errand-state probe
    // (resume + discovery). Identity-scoped and local, so read once and reused;
    // empty when no identity resolved (no record ref exists).
    let errandRecordsPromise: Promise<ErrandRecord[]> | undefined;
    const getErrandRecords = (): Promise<ErrandRecord[]> => {
      errandRecordsPromise ??= identity === null
        ? Promise.resolve([])
        : listErrandRecords({ exec: gitExec, identity });
      return errandRecordsPromise;
    };
    const getOracle = (): Promise<{
      entries: InFlightEntry[];
      warnings: InFlightWarning[];
      reachable: boolean;
    }> => {
      oraclePromise ??= (async () => {
        const resolved = await resolvedSettingsP;
        const teamMode = resolved.settings["team.mode"] === "true";
        const [records, parkedSlugs] = await Promise.all([
          getErrandRecords(),
          buildLifecycleIndex({ cwd, fs: lifecycleFs }).then(listParkedSlugs),
        ]);
        const errandSlugByBranch = new Map(records.map((record) => [record.branch, record.slug]));
        const result = await deriveInFlight({
          exec: gitExec,
          localOnly: false,
          baseBranch: resolved.settings["branch.base"],
          identity,
          teamMode,
          errandSlugByBranch,
          parkedSlugs,
        });
        // Unreachable: derive nothing rather than a half-resolved view over
        // un-pruned local refs. Consumers surface no candidates / skip discovery.
        if (!result.reachable) return { entries: [], warnings: result.warnings, reachable: false };
        return { entries: result.entries, warnings: result.warnings, reachable: result.reachable };
      })();
      return oraclePromise;
    };
    const probes: SessionInitProbes = {
      user: async (id) => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runUserSessionInitStatus({ cwd, io, identity: id, remoteSyncEnabled });
      },
      worktree: async () => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runWorktreeSyncStatus({ exec: gitExec, remoteSyncEnabled });
      },
      worktreeIdentity: () => resolveWorktreeIdentity(gitExec),
      baseDistance: async () => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runBaseDistanceStatus({
          exec: gitExec,
          baseBranch: resolved.settings["branch.base"],
          remoteSyncEnabled,
        });
      },
      baseBranchSync: async () => {
        const resolved = await resolvedSettingsP;
        const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
        return runBaseBranchSyncStatus({
          exec: gitExec,
          baseBranch: resolved.settings["branch.base"],
          remoteSyncEnabled,
        });
      },
      supersession: (branch) => detectSupersession({ exec: gitExec, branch }),
      dirty: () => resolveSessionInitDirtyState({
        compactionSeedGitSnapshotP,
        fallback: () => runDirtyStateStatus({ exec: gitExec }),
      }),
      extensions: () => runExtensionsSessionInitStatus({ cwd }),
      config: async () => runConfigSessionInitStatus({ cwd, resolvedSettings: await resolvedSettingsP }),
      active: (id, r) => runActiveSessionInitStatus({ cwd, identity: id, role: r, exec: gitExec }),
      domainRules: () => runDomainRulesSessionInitStatus({ cwd }),
      releaseRouting: async () => releaseRoutingFromSettings(await resolvedSettingsP),
      roster: async () => {
        const resolved = await resolvedSettingsP;
        const teamMode = resolved.settings["team.mode"] === "true";
        const roster = await runWorktreeRoster({
          exec: gitExec,
          fs: {
            readdir: (path) => readdir(path),
            readFile: (path) => readFile(path, "utf8"),
          },
        });
        return filterRosterByIdentity(roster, { identity, teamMode });
      },
      recovery: async (roster, currentBranch) => {
        const resolved = await resolvedSettingsP;
        const recentBranches = await runRecentRemoteBranches({
          exec: gitExec,
          withinDays: RECOVERY_RECENCY_DAYS,
        });
        return runBranchGoneRecovery({
          roster,
          currentBranch,
          baseBranch: resolved.settings["branch.base"],
          recentBranches,
          exec: gitExec,
        });
      },
      sweep: async (roster, worktreeIdentity) => {
        const resolved = await resolvedSettingsP;
        return runStaleWorktreeSweep({
          roster,
          worktreeIdentity,
          baseBranch: resolved.settings["branch.base"],
          exec: gitExec,
        });
      },
      planOrphanSweep: async (worktreeIdentity) => {
        const resolved = await resolvedSettingsP;
        return runPlanOrphanSweep({
          worktreeIdentity,
          baseBranch: resolved.settings["branch.base"],
          exec: gitExec,
        });
      },
      retiredSubdirs: async (id) => {
        const resolved = await resolvedSettingsP;
        return runRetiredSubdirDetection({
          cwd,
          identity: id,
          baseBranch: resolved.settings["branch.base"],
          exec: gitExec,
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
        // Errand records are the identity oracle for resume + discovery (shared
        // with the in-flight derivation); empty when no identity resolved.
        const records = await getErrandRecords();
        let entries: InFlightEntry[] | null = null;
        let oracleWarnings: string[] = [];
        if (input.includeDiscovery) {
          // Fire the dead-ref prune (hygiene backstop) alongside — not feeding —
          // the oracle: the oracle is prune-independent, so classification never
          // depends on the prune completing.
          const [, oracle] = await Promise.all([
            pruneRemoteTrackingRefs(gitExec),
            getOracle(),
          ]);
          entries = oracle.reachable ? oracle.entries : null;
          oracleWarnings = oracle.warnings.map(renderInFlightWarning);
        }
        return runErrandState({
          exec: gitExec,
          currentBranch: input.currentBranch,
          hasBackingMeta: input.hasBackingMeta,
          includeDiscovery: input.includeDiscovery,
          entries,
          oracleWarnings,
          records,
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
          exec: gitExec,
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
          prSource: input.includeSharpening ? createGhWorkUnitPrSource(gitExec) : undefined,
        });
      },
      inboxState: async (id) => runInboxState({ content: await readUserInbox(id) }),
      partialPushMarker: (id) => runPartialPushMarkerSurface({
        exec: gitExec,
        identity: id,
        now: new Date().toISOString(),
      }),
      compactionAdvisory: async (id) => runNotesCompactionSessionAdvisory({
        exec: gitExec,
        identity: id,
        nudge: await resolveNudgeState(
          cwd,
          io,
          id,
          NOTES_COMPACTION_NUDGE_MARKER_RELATIVE,
          userSurfacesFor,
        ),
      }),
      cohortDoc: (activeMetaPath) => resolveActiveCohortDocPath({
        cwd,
        activeMetaPath,
        fs: {
          readFile: (path) => readFile(path, "utf8"),
          pathExists: (path) => access(path).then(() => true, () => false),
        },
      }),
      taskCursor: async (taskListPath) =>
        resolveTaskListCursorFromFile({ cwd, taskListPath }),
    };
    const identityGlobalUserDir = identity === null
      ? null
      : (await userSurfacesFor(identity)).identityGlobalRoot;
    const result = await runSessionInitStatus({ identity, role, probes, identityGlobalUserDir });
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
    const resolved = await resolveAllSettings({ cwd, exec: gitExec, readFile: io.readFile });
    const teamMode = resolved.settings["team.mode"] === "true";
    const localOnly = Boolean(opts.local) || opts.fetch === false;
    const parkedSlugs = listParkedSlugs(await buildLifecycleIndex({ cwd, fs: lifecycleFs }));
    const view = await assembleStatusUserView({
      cwd,
      exec: gitExec,
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

async function readCompactionSeedGitSnapshot(cwd: string): Promise<CompactionSeedGitSnapshot> {
  const [headResult, statusResult] = await Promise.all([
    gitExec("git", ["rev-parse", "HEAD"], { cwd }),
    gitExec("git", ["status", "--porcelain=v1", "-z"], { cwd }),
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
function formatSlugStateQuery(query: SlugStateQuery): string {
  const position =
    query.position === null
      ? "—"
      : `${query.position.phase} · ${query.position.location}`;
  const lines = [
    `${query.slug} → ${query.state}`,
    `position: ${position}`,
    `occupied: ${query.occupied} · shipped: ${query.shipped}`,
  ];
  if (query.dependsOn.length > 0) {
    lines.push("depends on:");
    for (const dep of query.dependsOn) {
      lines.push(`  - ${dep.slug} — ${dep.landed ? "landed" : "not landed"}`);
    }
  }
  return lines.join("\n");
}
