/**
 * Shared recover-mode probe wiring for `arc status --recover` and `arc recover audit`.
 *
 * @module
 */

import { access, readFile } from "node:fs/promises";

import { runActiveSessionInitStatus, runActiveSessionInitStatusInternal } from "../commands/active.js";
import { runConfigSessionInitStatus } from "../commands/config.js";
import { runExtensionsSessionInitStatus } from "../commands/extensions.js";
import type { SessionRecoverProbes } from "../commands/status.js";
import { resolveAllSettings } from "../lib/config/resolved-settings.js";
import type { DirtyStateResult } from "../lib/git/dirty-state.js";
import { readTransientIdentitySnapshot } from "../lib/errand/identity-snapshot.js";
import { runWorktreeSyncStatus } from "../lib/git/worktree-sync.js";
import { resolveWorktreeIdentity } from "../lib/git/worktree-identity.js";
import { createUserIOContext, gitExec } from "../lib/io-context.js";
import { resolveReleaseRouting } from "../lib/release/routing.js";
import type { ReleaseRoutingValue } from "../lib/release/routing.js";
import { resolveLoadSetManifest } from "../lib/load-set/projection.js";
import { appendRecoveryWorkflow } from "../lib/recover/locus-context.js";
import { selectLegacyErrandRecoveryCandidate } from "../lib/recover/legacy-errand.js";
import { resolveActiveCohortDocPath } from "../lib/session-init/cohort-doc.js";
import { resolveTaskListCursorFromFile } from "../lib/task-list/file-cursor.js";
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
      const resolved = await resolvedSettingsP;
      return runLocusStateProbe({
        cwd,
        identity,
        baseBranch: resolved.settings["branch.base"],
        exec: gitExec,
      });
    },
    legacyErrand: async (identity, role, workingMemoryPath) => {
      if (identity === null) return null;
      const [branchResult, snapshot, active] = await Promise.all([
        gitExec("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
        readTransientIdentitySnapshot({ exec: gitExec, identity }),
        runActiveSessionInitStatusInternal({ cwd, identity, role, exec: gitExec }),
      ]);
      if (snapshot.kind === "absent") return null;
      if (snapshot.kind === "error") throw new Error(`Legacy identity ${snapshot.stage} read failed: ${snapshot.message}`);
      if (snapshot.diagnostics.length > 0) throw new Error("Legacy identity recovery basis contains diagnostics");
      const candidate = selectLegacyErrandRecoveryCandidate({
        currentBranch: branchResult.stdout.trim() || null,
        records: [...snapshot.records.values()],
        activeCandidates: active.resolved === null
          ? active.candidates.map((entry) => entry.candidate)
          : [active.resolved.candidate],
      });
      if (candidate === null) return null;
      const parent = active.result;
      if (parent.resolution !== "single" || parent.path !== candidate.parentMetaPath || parent.sessionType === null) {
        throw new Error(`Legacy Errand '${candidate.slug}' parent session does not resolve exactly`);
      }
      const cohortDocPath = await resolveActiveCohortDocPath({
        cwd,
        activeMetaPath: candidate.parentMetaPath,
        fs: {
          readFile: (path) => readFile(path, "utf8"),
          pathExists: (path) => access(path).then(() => true, () => false),
        },
      });
      const loadSet = appendRecoveryWorkflow(resolveLoadSetManifest({
        identity,
        workingMemoryPath,
        activeWorkUnit: workUnitName(candidate.parentMetaPath),
        metaPath: candidate.parentMetaPath,
        sessionType: parent.sessionType,
        planningStage: parent.planningStage,
        taskListPath: parent.taskListPath ?? null,
        cohortDocPath,
      }), ".arc/system/workflows/arc/supplemental/run-errand.md");
      const taskCursor = parent.taskListPath === undefined || parent.taskListPath === null
        ? null
        : await resolveTaskListCursorFromFile({ cwd, taskListPath: parent.taskListPath });
      return {
        frame: {
          kind: "legacy-errand" as const,
          workflow: "run-errand" as const,
          sessionType: parent.sessionType,
          slug: candidate.slug,
          branch: candidate.branch,
          returnBranch: candidate.returnBranch,
        },
        loadSet,
        taskCursor,
      };
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

function workUnitName(metaPath: string): string {
  const match = /(?:^|\/)meta-(.+)\.md$/u.exec(metaPath);
  if (match?.[1] === undefined) throw new Error(`Legacy parent meta path is malformed: ${metaPath}`);
  return match[1];
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
