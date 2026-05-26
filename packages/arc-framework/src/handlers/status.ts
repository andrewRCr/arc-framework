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
import {
  runBranchGoneRecovery,
  RECOVERY_RECENCY_DAYS,
} from "../lib/session-init/branch-gone-recovery.js";
import { runStaleWorktreeSweep } from "../lib/session-init/stale-worktree-sweep.js";
import { runRetiredSubdirDetection } from "../lib/session-init/retired-subdir-detection.js";
import { runDirtyStateStatus } from "../lib/git/dirty-state.js";
import { runHeadHashStatus } from "../lib/git/head-hash.js";
import { runPushabilityStatus } from "../lib/git/pushability.js";
import { runWorktreeSyncStatus } from "../lib/git/worktree-sync.js";
import { resolveWorktreeIdentity } from "../lib/git/worktree-identity.js";
import { deriveRestateCandidates } from "../lib/handoff/restate-candidates.js";
import { resolveSessionNotesPath } from "../lib/handoff/session-notes-path.js";
import {
  resolveAllSettings,
  type ResolvedSettingsResult,
} from "../lib/config/resolved-settings.js";
import { createUserIOContext, gitExec } from "../lib/io-context.js";
import { resolveReleaseRouting } from "../lib/release/routing.js";
import type { ReleaseRoutingValue } from "../lib/release/routing.js";
import { requireArcProjectRoot } from "./shared.js";

export interface StatusCliOptions {
  sessionInit?: boolean;
  sessionHandoff?: boolean;
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

export async function handleStatus(opts: StatusCliOptions): Promise<void> {
  if (opts.sessionInit && opts.sessionHandoff) {
    process.stderr.write(
      "Error: --session-init and --session-handoff are mutually exclusive.\n",
    );
    process.exitCode = 1;
    return;
  }

  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const json = Boolean(opts.json);
  const io = createUserIOContext();
  const { identity, role } = await readIdentityPointers();

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
    };
    const result = await runSessionHandoffStatus({ identity, role, probes });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (opts.sessionInit) {
    // See sessionHandoff branch above for the rationale on caching the
    // resolution promise rather than awaiting eagerly.
    const resolvedSettingsP = resolveAllSettings({ cwd, exec: gitExec, readFile: io.readFile });
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
