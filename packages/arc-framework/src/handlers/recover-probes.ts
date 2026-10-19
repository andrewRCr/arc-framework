/**
 * Shared recover-mode probe wiring for `arc status --recover` and `arc recover audit`.
 *
 * @module
 */

import { runConfigSessionInitStatus } from "../commands/config.js";
import type { SessionRecoverProbes } from "../commands/status.js";
import { resolveAllSettings } from "../lib/config/resolved-settings.js";
import type { DirtyStateResult } from "../lib/git/dirty-state.js";
import type { GitExec, GitExecInput } from "../lib/git/index.js";
import { runPassiveWorktreeInspection } from "../lib/git/worktree-sync.js";
import { resolveWorktreeIdentity } from "../lib/git/worktree-identity.js";
import { resolveReleaseRouting } from "../lib/release/routing.js";
import type { ReleaseRoutingValue } from "../lib/release/routing.js";
import { readDerivedLocusStateSnapshot } from "./derived-locus-state-probe.js";
import type { Store } from "../lib/store/contract.js";
import type { StateVersion } from "../lib/store/identity.js";
import type { StoreSyncPort } from "../lib/store/operational-sync.js";
import { readStateHistory } from "../lib/handoff/state-history.js";

export interface RecoverStatusProbeOptions {
  cwd: string;
  dirty: () => Promise<DirtyStateResult>;
  exec: GitExec;
  execInput: GitExecInput;
  readFile: (path: string) => Promise<string>;
  store?: Store;
  sync?: StoreSyncPort;
}

/** Recovery consumes the anchor captured with its derived frame, never a later version. */
export interface RecoverStatusProbes extends SessionRecoverProbes {
  stateVersion(identity: string): Promise<StateVersion | null>;
}

/** Build the recover-mode probe bundle, sharing settings resolution across probes. */
export function createRecoverStatusProbes(
  options: RecoverStatusProbeOptions,
): RecoverStatusProbes {
  const { cwd, dirty, exec, execInput, readFile } = options;
  const resolvedSettingsP = resolveAllSettings({ cwd, exec, readFile });
  const snapshots = new Map<string, ReturnType<typeof readDerivedLocusStateSnapshot>>();
  const snapshot = (identity: string): ReturnType<typeof readDerivedLocusStateSnapshot> => {
    let pending = snapshots.get(identity);
    if (pending !== undefined) return pending;
    pending = (async () => {
      const resolved = await resolvedSettingsP;
      return readDerivedLocusStateSnapshot({
        cwd,
        identity,
        baseBranch: resolved.settings["branch.base"],
        exec,
        ...(options.store === undefined ? {} : { store: options.store }),
      }, store => readStateHistory(() => store.version(), options.sync));
    })();
    snapshots.set(identity, pending);
    return pending;
  };
  return {
    derivedLocusState: async identity => (await snapshot(identity)).frame,
    stateVersion: async identity => (await snapshot(identity)).stateVersion,
    worktree: async () => {
      const resolved = await resolvedSettingsP;
      const remoteSyncEnabled = resolved.settings["session.remote_sync"] === "enabled";
      return runPassiveWorktreeInspection({
        exec,
        execInput,
        remoteSyncEnabled,
        cwd,
      });
    },
    worktreeIdentity: () => resolveWorktreeIdentity(exec),
    dirty,
    config: async () => runConfigSessionInitStatus({ cwd, resolvedSettings: await resolvedSettingsP }),
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
