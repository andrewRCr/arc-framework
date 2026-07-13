/** Resumable fail-closed coordinator for live review-gate qualification cells. */

import {
  QUALIFICATION_CELL_IDS,
  appendQualificationCell,
  createQualificationCheckpoint,
  finalizeQualification,
  validateQualificationCheckpoint,
  validateQualificationScope,
  type QualificationAcceptanceCandidate,
  type QualificationCellId,
  type QualificationCellResult,
  type QualificationCheckpoint,
  type QualificationScope,
} from "./qualification-contract.js";

export interface QualificationWorkspace {
  clean: boolean;
  branch: string;
  headSha: string;
  remoteDefaultBranch: string;
  remoteDefaultSha: string;
  actorIdentity: string;
}

export interface QualificationCheckpointStore {
  load(): Promise<QualificationCheckpoint | null>;
  save(checkpoint: QualificationCheckpoint): Promise<void>;
}

export interface QualificationProbePort {
  execute(cellId: QualificationCellId, scope: QualificationScope): Promise<{
    result: Omit<QualificationCellResult, "rawCheckpointHash">;
    rawNonSecret: unknown;
  }>;
  restoreSafeCheckpoint(cellId: QualificationCellId): Promise<void>;
}

export interface QualificationRawStore {
  write(cellId: QualificationCellId, rawNonSecret: unknown): Promise<string>;
}

export type QualificationRunResult =
  | { status: "qualified"; candidate: QualificationAcceptanceCandidate }
  | { status: "refused"; cellId: QualificationCellId | null; reason: string; repairDirective: "separate-work-unit" };

function workspaceFailure(scope: QualificationScope, workspace: QualificationWorkspace): string | null {
  if (!workspace.clean) return "dirty-checkout";
  if (workspace.branch !== scope.defaultBranch || workspace.remoteDefaultBranch !== scope.defaultBranch) {
    return "wrong-default-branch";
  }
  if (workspace.headSha !== scope.defaultBranchSha
    || workspace.remoteDefaultSha !== scope.defaultBranchSha
    || scope.implementationSha !== scope.defaultBranchSha) return "default-branch-sha-mismatch";
  if (workspace.actorIdentity !== scope.expectedActorIdentity) return "actor-mismatch";
  return null;
}

/** Execute or exactly resume the complete live matrix, persisting each private raw checkpoint before acceptance. */
export async function runQualification(input: {
  scope: QualificationScope;
  inspectWorkspace(): Promise<QualificationWorkspace>;
  checkpoints: QualificationCheckpointStore;
  raw: QualificationRawStore;
  probes: QualificationProbePort;
  resume?: boolean;
}): Promise<QualificationRunResult> {
  const scopeErrors = validateQualificationScope(input.scope);
  if (scopeErrors.length > 0) {
    return { status: "refused", cellId: null, reason: scopeErrors.join(","), repairDirective: "separate-work-unit" };
  }
  const workspaceError = workspaceFailure(input.scope, await input.inspectWorkspace());
  if (workspaceError !== null) {
    return { status: "refused", cellId: null, reason: workspaceError, repairDirective: "separate-work-unit" };
  }
  const loaded = await input.checkpoints.load();
  if (input.resume === true && loaded === null) {
    return { status: "refused", cellId: null, reason: "resume-checkpoint-missing", repairDirective: "separate-work-unit" };
  }
  if (loaded !== null && input.resume !== true) {
    return {
      status: "refused",
      cellId: null,
      reason: "checkpoint-exists-resume-required",
      repairDirective: "separate-work-unit",
    };
  }
  let checkpoint = loaded ?? createQualificationCheckpoint(input.scope);
  const checkpointErrors = validateQualificationCheckpoint(input.scope, checkpoint);
  if (checkpointErrors.length > 0) {
    return { status: "refused", cellId: null, reason: checkpointErrors.join(","), repairDirective: "separate-work-unit" };
  }
  if (checkpoint.blockedCell !== null) {
    return {
      status: "refused",
      cellId: checkpoint.blockedCell,
      reason: checkpoint.blockedReason ?? "checkpoint-blocked",
      repairDirective: "separate-work-unit",
    };
  }

  for (let index = checkpoint.completed.length; index < QUALIFICATION_CELL_IDS.length; index += 1) {
    const cellId = QUALIFICATION_CELL_IDS[index];
    if (cellId === undefined) throw new Error("qualification-cell-index-invalid");
    try {
      const currentWorkspaceError = workspaceFailure(input.scope, await input.inspectWorkspace());
      if (currentWorkspaceError !== null) throw new Error(`qualification-workspace-drift:${currentWorkspaceError}`);
      const observed = await input.probes.execute(cellId, input.scope);
      const rawCheckpointHash = await input.raw.write(cellId, observed.rawNonSecret);
      checkpoint = appendQualificationCell(input.scope, checkpoint, { ...observed.result, rawCheckpointHash });
      await input.checkpoints.save(checkpoint);
    } catch {
      let reason = "live-cell-failed-or-contaminated";
      try {
        await input.probes.restoreSafeCheckpoint(cellId);
      } catch {
        reason = "safe-checkpoint-restore-failed";
      }
      checkpoint = {
        ...checkpoint,
        blockedCell: cellId,
        blockedReason: reason,
      };
      await input.checkpoints.save(checkpoint);
      return {
        status: "refused",
        cellId,
        reason,
        repairDirective: "separate-work-unit",
      };
    }
  }
  return { status: "qualified", candidate: finalizeQualification(input.scope, checkpoint) };
}
