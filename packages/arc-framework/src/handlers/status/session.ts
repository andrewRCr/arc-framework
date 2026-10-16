/** Handoff, recovery, and ordinary composite status mode composition. */

import * as p from "../../lib/terminal.js";
import { createStoreSessionProbes } from "./store-session.js";
import { access } from "node:fs/promises";
import { runActiveStatus } from "../../commands/active.js";
import { runConfigStatus } from "../../commands/config.js";
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
import { resolveWorktreeIdentity } from "../../lib/git/worktree-identity.js";
import { deriveRestateCandidates } from "../../lib/handoff/restate-candidates.js";
import { resolveWorkUnitSessionNotesPath, resolveSessionNotesPath } from "../../lib/handoff/session-notes-path.js";
import { SlugSchema } from "../../lib/kernel/index.js";
import { runInboxState } from "../../lib/session-init/inbox-state.js";
import { runDerivedLocusStateProbe } from "../derived-locus-state-probe.js";
import { createRecoverStatusProbes } from "../recover-probes.js";
import type { StatusCliOptions } from "./input.js";
import type { SessionStatusContext } from "./session-context.js";
import { openDefaultStore } from "../lifecycle-shared.js";
import { releaseRoutingFromSettings } from "./session-evidence.js";

function requireGitExecInput(execInput: GitExecInput | undefined): GitExecInput {
  if (execInput === undefined) {
    throw new Error("Status recovery requires stdin-capable Git I/O.");
  }
  return execInput;
}

/** Bind handoff readers to one selected store and one derived frame per identity. */
export function createHandoffProbes(
  context: SessionStatusContext,
  resolvedSettingsP: Promise<ResolvedSettingsResult>,
): SessionHandoffProbes & { stateOffBranch: boolean; sessionNotesPath: (name?: string) => Promise<string | null> } {
  const { cwd, exec, io, identity, readUserInbox } = context;
  const store = context.store ?? openDefaultStore(cwd, exec);
  const frames = new Map<string, ReturnType<typeof runDerivedLocusStateProbe>>();
  const readFrame = (id: string) => {
    let frame = frames.get(id);
    if (frame === undefined) {
      frame = resolvedSettingsP.then(resolved => runDerivedLocusStateProbe({
        cwd, identity: id, baseBranch: resolved.settings["branch.base"], exec, store,
      }));
      frames.set(id, frame);
    }
    return frame;
  };
  const operational = store.capabilities.stateOffBranch ? createStoreSessionProbes({ store, sync: context.storeSync,
    cwd, exec, identity, readFrame: () => identity === null ? Promise.resolve(null) : readFrame(identity),
    readSettings: async () => (await resolvedSettingsP).settings, readUserInbox }) : null;
  const sessionNotesPath = async (name?: string): Promise<string | null> => {
    if (identity === null) return null;
    if (!store.capabilities.stateOffBranch && name === undefined) return resolveSessionNotesPath(cwd, identity, io);
    const workUnit = name ?? (await readFrame(identity)).active?.subject.key;
    if (workUnit === undefined) return null;
    const result = await resolveWorkUnitSessionNotesPath(cwd, identity, workUnit, { store, access });
    if (result.status === "error") throw new Error(result.message);
    return result.status === "resolved" ? result.path : null;
  };
  return {
    stateOffBranch: store.capabilities.stateOffBranch,
    sessionNotesPath,
    derivedLocusState: readFrame,
    dirty: () => runDirtyStateStatus({ exec }),
    worktreeIdentity: () => resolveWorktreeIdentity(exec),
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
      if (store.capabilities.stateOffBranch) return null;
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
      if (store.capabilities.stateOffBranch) {
        if (identity === null) throw new Error("Restating requires an identity.");
        const active = (await readFrame(identity)).active;
        if (active === null) return { commitsSinceHandoff: [], tasksClosedSinceHandoff: [], noteFileChangesSinceHandoff: [], baselineSignal: "baseline-unknown" as const };
        const resolved = await store.lookup({ kind: "slug", slug: SlugSchema.parse(active.subject.key) });
        if (resolved.status === "refused") throw new Error(`${resolved.refusal.condition} ${resolved.refusal.remedy.text}`);
        return deriveRestateCandidates({ exec, sessionNotes: null, store, workUnit: resolved.result.reference, identity, sync: context.storeSync });
      }
      let sessionNotes: string | null = null;
      if (identity !== null) {
        const path = await sessionNotesPath();
        if (path !== null) {
          sessionNotes = await io.readFile(path).catch(() => null);
        }
      }
      return deriveRestateCandidates({ exec, sessionNotes });
    },
    releaseRouting: async () => releaseRoutingFromSettings(await resolvedSettingsP),
    inboxState: async (id) => operational === null ? runInboxState({ content: await readUserInbox(id) }) : operational.inboxState(id),
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
        const selected = probes.stateOffBranch
          ? await probes.sessionNotesPath() : null;
        return {
          workingMemoryPath: surfaces.workingMemoryPath,
          sessionNotesPath: (workUnitName: string) => {
            if (selected !== null) return selected;
            if (probes.stateOffBranch) throw new Error("The active work unit has no resolved session context.");
            return surfaces.sessionNotesPath(SlugSchema.parse(workUnitName));
          },
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
      readFile: io.readFile, store: context.store,
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
