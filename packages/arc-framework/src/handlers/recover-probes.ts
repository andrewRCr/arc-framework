/**
 * Shared recover-mode probe wiring for `arc status --recover` and `arc recover audit`.
 *
 * @module
 */

import { runActiveSessionInitStatus } from "../commands/active.js";
import { runConfigSessionInitStatus } from "../commands/config.js";
import { runExtensionsSessionInitStatus } from "../commands/extensions.js";
import type { SessionRecoverProbes } from "../commands/status.js";
import { resolveAllSettings } from "../lib/config/resolved-settings.js";
import type { DirtyStateResult } from "../lib/git/dirty-state.js";
import type { GitExec } from "../lib/git/index.js";
import { runWorktreeSyncStatus } from "../lib/git/worktree-sync.js";
import { resolveWorktreeIdentity } from "../lib/git/worktree-identity.js";
import { createUserIOContext, gitExec } from "../lib/io-context.js";
import { resolveReleaseRouting } from "../lib/release/routing.js";
import type { ReleaseRoutingValue } from "../lib/release/routing.js";
import { runLocusStateProbe } from "./locus-state-probe.js";

export interface RecoverStatusProbeOptions {
  cwd: string;
  dirty: () => Promise<DirtyStateResult>;
  exec?: GitExec;
}

/** Build the recover-mode probe bundle, sharing settings resolution across probes. */
export function createRecoverStatusProbes(
  options: RecoverStatusProbeOptions,
): SessionRecoverProbes {
  const { cwd, dirty, exec = gitExec } = options;
  const io = createUserIOContext();
  const resolvedSettingsP = resolveAllSettings({ cwd, exec, readFile: io.readFile });
  const extensionsP = runExtensionsSessionInitStatus({ cwd });
  // The kickoff is eager but the consumer awaits it later, so pre-attach a no-op rejection
  // handler: a repository without `.arc/system/extensions` must degrade to a failed slot,
  // not an unhandled rejection that kills the process before any slot is composed.
  extensionsP.catch(() => undefined);
  return {
    locusState: async (identity) => {
      const resolved = await resolvedSettingsP;
      return runLocusStateProbe({
        cwd,
        identity,
        baseBranch: resolved.settings["branch.base"],
        exec,
      });
    },
    worktree: async () => {
      const resolved = await resolvedSettingsP;
      const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
      return runWorktreeSyncStatus({ exec, remoteSyncEnabled });
    },
    worktreeIdentity: () => resolveWorktreeIdentity(exec),
    dirty,
    extensions: () => extensionsP,
    config: async () => runConfigSessionInitStatus({ cwd, resolvedSettings: await resolvedSettingsP }),
    active: (identity, role) => runActiveSessionInitStatus({ cwd, identity, role, exec }),
    releaseRouting: async () => releaseRoutingFromSettings(await resolvedSettingsP),
  };
}

function releaseRoutingFromSettings(
  settings: Awaited<ReturnType<typeof resolveAllSettings>>,
): ReleaseRoutingValue {
  return resolveReleaseRouting({
    releaseOptedIn: settings.resolved.releaseOptedIn.value === "true",
    commitInterlock: settings.resolved.commitInterlock.value,
    pushInterlock: settings.resolved.pushInterlock.value,
  });
}
