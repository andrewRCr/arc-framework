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
import { join } from "node:path";

import * as p from "@clack/prompts";

import {
  buildSessionInitStatusSummary,
  buildStatusSummary,
  runSessionHandoffStatus,
  runSessionInitStatus,
  runStatus,
} from "../commands/status.js";
import type {
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
import { resolveInFlightBranchSet } from "../lib/git/remote-ref-reader.js";
import { deriveInFlight, type InFlightEntry } from "../lib/git/in-flight-derivation.js";
import { findMaterializableWorkUnits } from "../lib/session-init/materializable-work-units.js";
import { pruneRemoteTrackingRefs } from "../lib/session-init/dead-ref-prune.js";
import {
  runBranchGoneRecovery,
  RECOVERY_RECENCY_DAYS,
} from "../lib/session-init/branch-gone-recovery.js";
import { runStaleWorktreeSweep } from "../lib/session-init/stale-worktree-sweep.js";
import { runRetiredSubdirDetection } from "../lib/session-init/retired-subdir-detection.js";
import { runErrandStalenessSweep } from "../lib/session-init/errand-staleness-sweep.js";
import { runErrandState } from "../lib/session-init/errand-state.js";
import { runWorkUnitState } from "../lib/session-init/work-unit-state.js";
import { createGhWorkUnitPrSource } from "../lib/session-init/work-unit-pr-source.js";
import { runInboxState } from "../lib/session-init/inbox-state.js";
import { resolveActiveCohortDocPath } from "../lib/session-init/cohort-doc.js";
import { extractReminderEntries } from "../lib/session-init/inbox-reminders.js";
import { shouldNudge, type NudgeMarkerState } from "../lib/session-init/nudge-rate-limit.js";
import { runDirtyStateStatus } from "../lib/git/dirty-state.js";
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
import { assembleStatusUserView } from "../lib/status/assemble-user-view.js";
import { buildLifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { resolveSlugQuery, type SlugStateQuery } from "../lib/work-unit/lifecycle-query.js";
import { requireArcProjectRoot } from "./shared.js";

export interface StatusCliOptions {
  sessionInit?: boolean;
  sessionHandoff?: boolean;
  user?: boolean;
  /** `--local`: render the user view from local refs without a network read. */
  local?: boolean;
  /** Commander's negation of `--no-fetch` (defaults to `true`); `false` skips the network read. */
  fetch?: boolean;
  json?: boolean;
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
): Promise<NudgeMarkerState> {
  const today = new Date().toISOString().slice(0, 10);
  if (identity === null) {
    return { shouldNudge: false, markerPath: null, today };
  }
  const markerPath = `.arc/user/${identity}/${markerRelative}`;
  const absoluteMarkerPath = join(cwd, ".arc", "user", identity, markerRelative);
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
    opts.user,
  ].filter(Boolean).length;
  if (modeCount > 1) {
    process.stderr.write(
      "Error: a status <slug> query, --session-init, --session-handoff, and --user are mutually exclusive.\n",
    );
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

  const io = createUserIOContext();
  const { identity, role } = await readIdentityPointers();
  // Both the inbox-state and reminder-sweep probes read the same personal
  // `USER-INBOX.md`; a missing file reads as empty (no captures).
  const readUserInbox = (id: string): Promise<string> =>
    io.readFile(join(cwd, ".arc", "user", id, "USER-INBOX.md")).catch(() => "");

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

  if (opts.sessionInit) {
    // See sessionHandoff branch above for the rationale on caching the
    // resolution promise rather than awaiting eagerly.
    const resolvedSettingsP = resolveAllSettings({ cwd, exec: gitExec, readFile: io.readFile });
    // Shared in-flight oracle slice — the bounded network read (live remote
    // membership → pruned-ref derivation) feeding both the errand-state and
    // materializable-WU probes. Both gate on the no-active-WU arm, so when one
    // fires the other does too; memoizing keeps it a single read. Lazy: a resume
    // session forces neither probe, so the network read never runs there.
    let oraclePromise: Promise<{ entries: InFlightEntry[]; reachable: boolean }> | undefined;
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
    const getOracle = (): Promise<{ entries: InFlightEntry[]; reachable: boolean }> => {
      oraclePromise ??= (async () => {
        const resolved = await resolvedSettingsP;
        const teamMode = resolved.settings["team.mode"] === "true";
        const { branches, reachable } = await resolveInFlightBranchSet({
          exec: gitExec,
          localOnly: false,
        });
        // Unreachable: derive nothing rather than a half-resolved view over
        // un-pruned local refs. Consumers surface no candidates / skip discovery.
        if (!reachable) return { entries: [], reachable: false };
        const records = await getErrandRecords();
        const errandSlugByBranch = new Map(records.map((record) => [record.branch, record.slug]));
        const entries = await deriveInFlight({
          exec: gitExec,
          branches,
          identity,
          teamMode,
          errandSlugByBranch,
        });
        return { entries, reachable: true };
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
      dirty: () => runDirtyStateStatus({ exec: gitExec }),
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
          cwd,
          baseBranch: resolved.settings["branch.base"],
          exec: gitExec,
          fs: { readdir: (path) => readdir(path) },
        });
      },
      retiredSubdirs: (id) => runRetiredSubdirDetection({
        cwd,
        identity: id,
        exec: gitExec,
        readDir: io.readDir,
        fs: { readdir: (path) => readdir(path) },
      }),
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
        if (input.includeDiscovery) {
          // Fire the dead-ref prune (hygiene backstop) alongside — not feeding —
          // the oracle: the oracle is prune-independent, so classification never
          // depends on the prune completing.
          const [, oracle] = await Promise.all([
            pruneRemoteTrackingRefs(gitExec),
            getOracle(),
          ]);
          entries = oracle.reachable ? oracle.entries : null;
        }
        return runErrandState({
          exec: gitExec,
          currentBranch: input.currentBranch,
          hasBackingMeta: input.hasBackingMeta,
          includeDiscovery: input.includeDiscovery,
          entries,
          records,
          baseBranch: resolved.settings["branch.base"],
          staleThresholdDays: thresholdDays,
          nudge: await resolveNudgeState(cwd, io, identity, ERRAND_NUDGE_MARKER_RELATIVE),
        });
      },
      materializableWorkUnits: async () => {
        const { entries, reachable } = await getOracle();
        if (!reachable) return { candidates: [] };
        return findMaterializableWorkUnits({ entries, identity });
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
          nudge: await resolveNudgeState(cwd, io, identity, WORK_UNIT_STALE_NUDGE_MARKER_RELATIVE),
          prSource: input.includeSharpening ? createGhWorkUnitPrSource(gitExec) : undefined,
        });
      },
      inboxState: async (id) => runInboxState({ content: await readUserInbox(id) }),
      cohortDoc: (activeMetaPath) => resolveActiveCohortDocPath({
        cwd,
        activeMetaPath,
        fs: {
          readFile: (path) => readFile(path, "utf8"),
          pathExists: (path) => access(path).then(() => true, () => false),
        },
      }),
    };
    const result = await runSessionInitStatus({ identity, role, probes });
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
    const view = await assembleStatusUserView({
      cwd,
      exec: gitExec,
      identity,
      teamMode,
      localOnly,
      readFile: io.readFile,
      readdir: (path) => readdir(path),
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
