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
import { runWorktreeSyncStatus } from "../lib/git/worktree-sync.js";
import { resolveWorktreeIdentity } from "../lib/git/worktree-identity.js";
import { createUserIOContext, gitExec } from "../lib/io-context.js";
import { resolveReleaseRouting } from "../lib/release/routing.js";
import type { ReleaseRoutingValue } from "../lib/release/routing.js";
import { runLocusStateProbe } from "./locus-state-probe.js";

export interface RecoverStatusProbeOptions {
  cwd: string;
  dirty: () => Promise<DirtyStateResult>;
}

/** Build the recover-mode probe bundle, sharing settings resolution across probes. */
export function createRecoverStatusProbes(
  options: RecoverStatusProbeOptions,
): SessionRecoverProbes {
  const { cwd, dirty } = options;
  const io = createUserIOContext();
  const resolvedSettingsP = resolveAllSettings({ cwd, exec: gitExec, readFile: io.readFile });
  const extensionsP = runExtensionsSessionInitStatus({ cwd });
  return {
    locusState: async (identity) => {
      const [resolved, extensions] = await Promise.all([resolvedSettingsP, extensionsP]);
      return runLocusStateProbe({
        cwd,
        identity,
        baseBranch: resolved.settings["branch.base"],
        activeExtensions: extensions.active,
        exec: gitExec,
      });
    },
    worktree: async () => {
      const resolved = await resolvedSettingsP;
      const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
      return runWorktreeSyncStatus({ exec: gitExec, remoteSyncEnabled });
    },
    worktreeIdentity: () => resolveWorktreeIdentity(gitExec),
    dirty,
    extensions: () => extensionsP,
    config: async () => runConfigSessionInitStatus({ cwd, resolvedSettings: await resolvedSettingsP }),
    active: (identity, role) => runActiveSessionInitStatus({ cwd, identity, role, exec: gitExec }),
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
