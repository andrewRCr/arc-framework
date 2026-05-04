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

import { access } from "node:fs/promises";

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
import { gitConfigGet } from "../lib/git/index.js";
import { runDirtyStateStatus } from "../lib/git/dirty-state.js";
import { runHeadHashStatus } from "../lib/git/head-hash.js";
import { runPushabilityStatus } from "../lib/git/pushability.js";
import { runWorktreeSyncStatus } from "../lib/git/worktree-sync.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { createUserIOContext, gitExec } from "../lib/io-context.js";
import { resolveSyncPushPolicy } from "../lib/sync-policy.js";
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
    const { settings } = await readConfigSettings(cwd);
    const remoteSyncEnabled = settings["session.remote_sync"] === "enabled";
    const probes: SessionHandoffProbes = {
      dirty: () => runDirtyStateStatus({ exec: gitExec }),
      worktree: () => runWorktreeSyncStatus({ exec: gitExec, remoteSyncEnabled }),
      user: (id) => runUserSessionInitStatus({ cwd, io, identity: id, remoteSyncEnabled }),
      pushInterlock: async () => {
        const result = await runConfigSessionInitStatus({ cwd });
        const key = "session.push_interlock";
        return {
          value: result.settings[key] as "manual" | "on-handoff",
          source: result.defaultsApplied.includes(key) ? "default" : "yaml",
        };
      },
      syncPush: () => resolveSyncPushPolicy({
        exec: gitExec,
        readFile: io.readFile,
        cwd,
      }),
      active: (id, r) => runActiveSessionInitStatus({ cwd, identity: id, role: r, exec: gitExec }),
      head: () => runHeadHashStatus({ exec: gitExec }),
      pushability: () => runPushabilityStatus({
        exec: gitExec,
        access,
        target: "worktree",
      }),
    };
    if (!json) {
      process.stderr.write(
        "Error: --session-handoff currently requires --json (interactive rendering not yet implemented).\n",
      );
      process.exitCode = 1;
      return;
    }
    const result = await runSessionHandoffStatus({ identity, role, probes });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (opts.sessionInit) {
    const { settings } = await readConfigSettings(cwd);
    const remoteSyncEnabled = settings["session.remote_sync"] === "enabled";
    const probes: SessionInitProbes = {
      user: (id) => runUserSessionInitStatus({ cwd, io, identity: id, remoteSyncEnabled }),
      worktree: () => runWorktreeSyncStatus({ exec: gitExec, remoteSyncEnabled }),
      extensions: () => runExtensionsSessionInitStatus({ cwd }),
      config: () => runConfigSessionInitStatus({ cwd }),
      active: (id, r) => runActiveSessionInitStatus({ cwd, identity: id, role: r, exec: gitExec }),
      domainRules: () => runDomainRulesSessionInitStatus({ cwd }),
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
