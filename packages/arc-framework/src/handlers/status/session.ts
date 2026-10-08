/** Handoff, recovery, and ordinary composite status mode composition. */

import * as p from "../../lib/terminal.js";
import { access } from "node:fs/promises";
import { runActiveStatus } from "../../commands/active.js";
import { runConfigStatus } from "../../commands/config.js";
import { runExtensionsSessionInitStatus, runExtensionsStatus } from "../../commands/extensions.js";
import type { SessionHandoffProbes, StatusProbes } from "../../commands/status.js";
import { buildStatusSummary, runRecoverStatus, runSessionHandoffStatus, runStatus } from "../../commands/status.js";
import { assertSessionRecoverProbeResult } from "../../commands/status/schema.js";
import { runUserSessionInitStatus, runUserStatus } from "../../commands/user.js";
import { resolveAllSettings, type ResolvedSettingsResult } from "../../lib/config/resolved-settings.js";
import { runDirtyStateStatus } from "../../lib/git/dirty-state.js";
import { runHeadHashStatus } from "../../lib/git/head-hash.js";
import type { GitExecInput } from "../../lib/git/index.js";
import { runPushabilityStatus } from "../../lib/git/pushability.js";
import { runPassiveWorktreeInspection } from "../../lib/git/worktree-sync.js";
import { deriveRestateCandidates } from "../../lib/handoff/restate-candidates.js";
import { resolveSessionNotesPath } from "../../lib/handoff/session-notes-path.js";
import { SlugSchema } from "../../lib/kernel/index.js";
import { runInboxState } from "../../lib/session-init/inbox-state.js";
import { runDerivedLocusStateProbe } from "../derived-locus-state-probe.js";
import { createRecoverStatusProbes } from "../recover-probes.js";
import type { StatusCliOptions } from "./input.js";
import type { SessionStatusContext } from "./session-context.js";
import { releaseRoutingFromSettings } from "./session-evidence.js";

function requireGitExecInput(execInput: GitExecInput | undefined): GitExecInput {
  if (execInput === undefined) {
    throw new Error("Status recovery requires stdin-capable Git I/O.");
  }
  return execInput;
}

function createHandoffProbes(
  context: SessionStatusContext,
  resolvedSettingsP: Promise<ResolvedSettingsResult>,
): SessionHandoffProbes {
  const { cwd, exec, io, identity, readUserInbox } = context;
  return {
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
      if (io.execInput === undefined) {
        throw new Error("Handoff worktree inspection requires stdin-capable Git I/O.");
      }
      return runPassiveWorktreeInspection({
        exec,
        execInput: io.execInput,
        remoteSyncEnabled,
        cwd,
      });
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
}

/**
 * Execute the session handoff status mode.
 * @param context - Request-scoped I/O, identity, and personal-surface readers.
 * @param opts - Validated status options.
 * @returns Completion after writing the selected status output.
 */
export async function handleSessionHandoffStatus(context: SessionStatusContext, opts: StatusCliOptions): Promise<void> {
  const { cwd, exec, io, identity, role, userSurfacesFor } = context;
  const json = Boolean(opts.json);
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
  const probes = createHandoffProbes(context, resolvedSettingsP);
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

/**
 * Execute the recover status mode.
 * @param context - Request-scoped I/O, identity, and personal-surface readers.
 * @param opts - Validated status options.
 * @returns Completion after writing the selected status output.
 */
export async function handleRecoverStatus(context: SessionStatusContext, opts: StatusCliOptions): Promise<void> {
  const { cwd, exec, io, identity, role, userSurfacesFor } = context;
  const json = Boolean(opts.json);
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
      exec,
      execInput: requireGitExecInput(io.execInput),
      readFile: io.readFile,
    }),
    workingMemoryPath: identity === null ? null : (await userSurfacesFor(identity)).workingMemoryPath,
  });
  assertSessionRecoverProbeResult(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return;
}

/**
 * Execute the composite status mode.
 * @param context - Request-scoped I/O, identity, and personal-surface readers.
 * @param opts - Validated status options.
 * @returns Completion after writing the selected status output.
 */
export async function handleCompositeStatus(context: SessionStatusContext, opts: StatusCliOptions): Promise<void> {
  const { cwd, exec, io, identity, role } = context;
  const json = Boolean(opts.json);
  const probes: StatusProbes = {
    user: (id) => runUserStatus({ cwd, io, identity: id }),
    extensions: () => runExtensionsStatus({ cwd }),
    config: () => runConfigStatus({ cwd }),
    active: () => runActiveStatus({ cwd, exec }),
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
