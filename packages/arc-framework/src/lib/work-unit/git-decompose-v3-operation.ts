/** Repository-bound composition and execution of one immutable v3 decomposition result. */

import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { canonicalize } from "../canonical/canonical-json.js";
import {
  composeGitV3ExtractionRepositoryPlan,
  composeGitV3RepositoryPlan,
  type GitV3RepositoryPlanDependencies,
  type GitV3RepositoryPlanResult,
} from "./git-decompose-v3-repository-plan.js";
import {
  occupyDecomposeResult,
  type DecomposeResultOccupationResult,
} from "./decompose-result-occupation.js";
import {
  executeV3DecomposeOperation,
  type V3DecomposeOperationResult,
  executeV3ExtractionOperation,
  type V3ExtractionOperationResult,
} from "./decompose-v3-operation.js";
import type { V3MaterializerIO } from "./decompose-v3-materializer.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import { revalidateV3DecomposeExecutionPreflight } from "./decompose-v3-execution-preflight.js";
import { decodeV3DecomposeCutMap } from "./decompose-v3-schema.js";
import {
  createGitV3DecomposeOperationIO,
} from "./git-decompose-v3-operation-io.js";
import {
  resolveTransitionRecordPath,
  writeTransitionRecord,
} from "./transition-record-store.js";
import { createInRepoTerminalTransitionRecordWriter } from "./terminal-transition-record-writer.js";
import { isGitTransitionOriginOccupied } from "./git-transition-record-enumeration.js";
import type { ProtectionMode } from "../git/write-context.js";
import { createExecaRawGitExec } from "../git/process-executor.js";
import { createGitV3DecomposePreflight } from "./git-decompose-v3-preflight.js";
import { readLiveRemoteBranchTip } from "../git/remote-ref-reader.js";
import {
  renderV3DecomposeExtractCommand,
  renderV3DecomposeExecuteCommand,
  renderV3DecomposePreflightCommand,
} from "./decompose-command-renderer.js";
import {
  isV3DecomposeMappedReason,
  v3DecomposeRemedy,
  type V3DecomposeRefusalEvidence,
} from "./decompose-v3-refusal.js";
import type { SpineRemedy } from "../../scripts/integration/spine-refusal.js";

export interface GitV3DecomposeOperationDependencies extends GitV3RepositoryPlanDependencies {
  spawningIdentity: string;
}

export interface GitV3DecomposeOperationInput {
  protection: ProtectionMode;
  baseBranch: string;
  completedMap: unknown;
}

export interface GitV3DecomposeCommandInput {
  protection: ProtectionMode;
  baseBranch: string;
  origin: string;
  cutMapPath: string;
}

export type GitV3DecomposeOperationResult =
  | {
      status: "staged";
      plan: ValidatedDecomposePlan;
      operation: Extract<V3DecomposeOperationResult, { status: "staged" }>;
    }
  | {
      status: "refused";
      stage: "repository-plan";
      reason: string;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
      recovery: { kind: "none" };
    }
  | Extract<V3DecomposeOperationResult, { status: "refused" }>;

export type GitV3DecomposeCommandResult =
  | Extract<GitV3DecomposeOperationResult, { status: "staged" }>
  | (Extract<GitV3DecomposeOperationResult, { status: "refused" }> & {
      remedy: string | SpineRemedy;
    });

export type GitV3ExtractionOperationResult =
  | {
      status: "staged";
      plan: ValidatedDecomposePlan;
      operation: Extract<V3ExtractionOperationResult, { status: "staged" }>;
    }
  | {
      status: "refused";
      stage: "repository-plan";
      reason: string;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
      recovery: { kind: "none" };
    }
  | Extract<V3ExtractionOperationResult, { status: "refused" }>;

export type GitV3ExtractionCommandResult =
  | Extract<GitV3ExtractionOperationResult, { status: "staged" }>
  | (Extract<GitV3ExtractionOperationResult, { status: "refused" }> & {
      remedy: string;
    });

function repositoryRefusal(
  result: Extract<GitV3RepositoryPlanResult, { status: "refused" }>,
): GitV3DecomposeOperationResult {
  return {
    status: "refused",
    stage: "repository-plan",
    reason: `${result.refusal.stage}:${result.refusal.reason}`,
    ...("locus" in result.refusal && result.refusal.locus !== undefined
      ? { locus: result.refusal.locus }
      : {}),
    ...(result.refusal.evidence === undefined ? {} : { evidence: result.refusal.evidence }),
    recovery: { kind: "none" },
  };
}

function extractionRepositoryRefusal(
  result: Extract<GitV3RepositoryPlanResult, { status: "refused" }>,
): GitV3ExtractionOperationResult {
  return {
    status: "refused",
    stage: "repository-plan",
    reason: `${result.refusal.stage}:${result.refusal.reason}`,
    ...("locus" in result.refusal && result.refusal.locus !== undefined
      ? { locus: result.refusal.locus }
      : {}),
    ...(result.refusal.evidence === undefined ? {} : { evidence: result.refusal.evidence }),
    recovery: { kind: "none" },
  };
}

function exactPlan(
  expected: ValidatedDecomposePlan,
  candidate: ValidatedDecomposePlan,
): boolean {
  return canonicalize(expected) === canonicalize(candidate);
}

function exactInventory(
  expected: GitV3RepositoryPlanResult & { status: "composed" },
  candidate: GitV3RepositoryPlanResult & { status: "composed" },
): boolean {
  return canonicalize(expected.sourceArtifactInventory)
    === canonicalize(candidate.sourceArtifactInventory);
}

function exactExtractionFacts(
  expected: GitV3RepositoryPlanResult & { status: "composed" },
  candidate: GitV3RepositoryPlanResult & { status: "composed" },
): boolean {
  return canonicalize(expected.extractionFacts) === canonicalize(candidate.extractionFacts);
}

function materializerProxy(
  target: () => string | null,
  create: (cwd: string) => V3MaterializerIO,
): V3MaterializerIO {
  const resolve = (): V3MaterializerIO => {
    const cwd = target();
    if (cwd === null) throw new Error("Decomposition result locus was not occupied.");
    return create(cwd);
  };
  return {
    observe: async (path) => await resolve().observe(path),
    readBlob: async (contentDigest) => await resolve().readBlob(contentDigest),
    applyAndStageFinal: async (path, state, bytes) =>
      await resolve().applyAndStageFinal(path, state, bytes),
  };
}

/**
 * Compose, occupy, materialize, stage, and durably prepare one completed v3 map.
 *
 * @param dependencies - Exact Git/object readers plus the identity that owns a created candidate worktree.
 * @param input - Protection mode, configured base, and completed cut map.
 * @returns One prepared repository result or a closed refusal with exact recovery.
 */
export async function executeGitV3DecomposeOperation(
  dependencies: GitV3DecomposeOperationDependencies,
  input: GitV3DecomposeOperationInput,
): Promise<GitV3DecomposeOperationResult> {
  const composed = await composeGitV3RepositoryPlan(
    dependencies,
    input.baseBranch,
    input.completedMap,
  );
  if (composed.status === "refused") return repositoryRefusal(composed);
  const completedMap = decodeV3DecomposeCutMap(input.completedMap);
  if (completedMap.status === "rejected") {
    return {
      status: "refused",
      stage: "repository-plan",
      reason: `map:${completedMap.issue.code}`,
      locus: completedMap.issue.path,
      recovery: { kind: "none" },
    };
  }
  const io = await createGitV3DecomposeOperationIO({
    cwd: dependencies.cwd,
    exec: dependencies.exec,
    spawningIdentity: dependencies.spawningIdentity,
    blobs: composed.blobs,
  });
  let targetCwd: string | null = null;
  const partialRecovery = io.partialRecovery(dependencies.cwd);
  const revalidate = async (plan: ValidatedDecomposePlan, requireCleanProjection: boolean) => {
    const refreshed = await composeGitV3RepositoryPlan(
      dependencies,
      input.baseBranch,
      input.completedMap,
    );
    if (refreshed.status === "refused") {
      return {
        status: "refused" as const,
        reason: `${refreshed.refusal.stage}:${refreshed.refusal.reason}`,
      };
    }
    if (!exactPlan(plan, refreshed.plan) || !exactInventory(composed, refreshed)) {
      return { status: "refused" as const, reason: "repository-plan-drift" };
    }
    if (input.protection === "partial" && requireCleanProjection) {
      const projection = await io.occupation.inspectPartial(
        input.baseBranch,
        plan.allowedPaths,
      );
      if (projection.baseHead !== plan.expectedBaseHead
        || !projection.indexClean
        || !projection.worktreeClean) {
        return { status: "refused" as const, reason: "partial-projection-drift" };
      }
    }
    return { status: "valid" as const };
  };
  const operation = await executeV3DecomposeOperation({
    protection: input.protection,
    configuredBase: input.baseBranch,
    plan: composed.plan,
    completedMap: completedMap.value,
  }, {
    occupy: async (occupationInput): Promise<DecomposeResultOccupationResult> => {
      const occupied = await occupyDecomposeResult(occupationInput, io.occupation);
      if (occupied.status === "occupied") {
        targetCwd = occupied.protection === "full" ? occupied.path : dependencies.cwd;
      }
      return occupied;
    },
    revalidate: async (plan) => await revalidate(plan, true),
    materializer: materializerProxy(
      () => targetCwd,
      (cwd) => io.materializer(cwd),
    ),
    ...(input.protection === "partial" ? { partialRecovery } : {}),
    transitionRecords: {
      record: async (record) => {
        if (targetCwd === null) return { status: "unavailable", diagnostic: "result-locus-unavailable" };
        const cwd = targetCwd;
        return await createInRepoTerminalTransitionRecordWriter({
          cwd,
          exec: dependencies.exec,
          isOriginOccupied: (origin) => isGitTransitionOriginOccupied(createExecaRawGitExec(cwd), origin),
          createRecord: async (candidate) => {
            await writeTransitionRecord(cwd, candidate);
          },
          removeRecord: async (origin) => {
            await rm(resolveTransitionRecordPath(cwd, origin), { force: true });
          },
        }).record(record);
      },
      rollback: async (record) => {
        if (targetCwd === null) return { status: "unavailable", diagnostic: "result-locus-unavailable" };
        const cwd = targetCwd;
        return await createInRepoTerminalTransitionRecordWriter({
          cwd,
          exec: dependencies.exec,
          isOriginOccupied: (origin) => isGitTransitionOriginOccupied(createExecaRawGitExec(cwd), origin),
          createRecord: async (candidate) => {
            await writeTransitionRecord(cwd, candidate);
          },
          removeRecord: async (origin) => {
            await rm(resolveTransitionRecordPath(cwd, origin), { force: true });
          },
        }).rollback(record);
      },
    },
    revalidateStaged: async (plan) => {
      if (targetCwd === null) {
        return { status: "refused" as const, reason: "result-locus-unavailable" };
      }
      return await revalidate(plan, false);
    },
  });
  if (operation.status === "refused") return operation;
  return {
    status: "staged",
    plan: composed.plan,
    operation,
  };
}

/**
 * Compose, occupy, and stage one additive extraction result without retirement history.
 *
 * @param dependencies - Exact Git/object readers plus the candidate worktree owner.
 * @param input - Protection mode, configured base, and completed extraction map.
 * @returns One prepared additive result or a closed refusal with exact recovery.
 */
export async function executeGitV3ExtractionOperation(
  dependencies: GitV3DecomposeOperationDependencies,
  input: GitV3DecomposeOperationInput,
): Promise<GitV3ExtractionOperationResult> {
  const composed = await composeGitV3ExtractionRepositoryPlan(
    dependencies,
    input.baseBranch,
    input.completedMap,
  );
  if (composed.status === "refused") return extractionRepositoryRefusal(composed);
  const completedMap = decodeV3DecomposeCutMap(input.completedMap);
  if (completedMap.status === "rejected" || completedMap.value.authoring.shape !== "extraction") {
    return {
      status: "refused",
      stage: "repository-plan",
      reason: "map:authoring-shape",
      locus: "authoring.shape",
      recovery: { kind: "none" },
    };
  }
  if (composed.extractionFacts === undefined) {
    return {
      status: "refused",
      stage: "repository-plan",
      reason: "composition:extraction-facts-missing",
      recovery: { kind: "none" },
    };
  }
  const io = await createGitV3DecomposeOperationIO({
    cwd: dependencies.cwd,
    exec: dependencies.exec,
    spawningIdentity: dependencies.spawningIdentity,
    blobs: composed.blobs,
  });
  let targetCwd: string | null = null;
  const partialRecovery = io.partialRecovery(dependencies.cwd);
  const revalidate = async (plan: ValidatedDecomposePlan, requireCleanProjection: boolean) => {
    const refreshed = await composeGitV3ExtractionRepositoryPlan(
      dependencies,
      input.baseBranch,
      input.completedMap,
    );
    if (refreshed.status === "refused") {
      return {
        status: "refused" as const,
        reason: `${refreshed.refusal.stage}:${refreshed.refusal.reason}`,
      };
    }
    if (!exactPlan(plan, refreshed.plan)
      || !exactInventory(composed, refreshed)
      || !exactExtractionFacts(composed, refreshed)) {
      return { status: "refused" as const, reason: "repository-plan-drift" };
    }
    if (input.protection === "partial" && requireCleanProjection) {
      const projection = await io.occupation.inspectPartial(input.baseBranch, plan.allowedPaths);
      if (projection.baseHead !== plan.expectedBaseHead
        || !projection.indexClean
        || !projection.worktreeClean) {
        return { status: "refused" as const, reason: "partial-projection-drift" };
      }
    }
    return { status: "valid" as const };
  };
  const operation = await executeV3ExtractionOperation({
    protection: input.protection,
    configuredBase: input.baseBranch,
    origin: completedMap.value.machine.source.origin,
    plan: composed.plan,
    extractionFacts: composed.extractionFacts,
  }, {
    occupy: async (occupationInput): Promise<DecomposeResultOccupationResult> => {
      const occupied = await occupyDecomposeResult(occupationInput, io.occupation);
      if (occupied.status === "occupied") {
        targetCwd = occupied.protection === "full" ? occupied.path : dependencies.cwd;
      }
      return occupied;
    },
    revalidate: async (plan) => await revalidate(plan, true),
    materializer: materializerProxy(
      () => targetCwd,
      (cwd) => io.materializer(cwd),
    ),
    ...(input.protection === "partial" ? { partialRecovery } : {}),
    revalidateStaged: async (plan) => {
      if (targetCwd === null) {
        return { status: "refused" as const, reason: "result-locus-unavailable" };
      }
      return await revalidate(plan, false);
    },
  });
  if (operation.status === "refused") return operation;
  return { status: "staged", plan: composed.plan, operation };
}

/**
 * Read one canonical cut map, revalidate its invocation provenance, and execute its immutable result.
 *
 * @param dependencies - Exact Git/object readers plus the candidate worktree owner.
 * @param input - Closed execute-command operands and configured repository policy.
 * @returns One prepared repository result or a closed refusal with exact recovery.
 */
export async function executeGitV3DecomposeCommand(
  dependencies: GitV3DecomposeOperationDependencies,
  input: GitV3DecomposeCommandInput,
): Promise<GitV3DecomposeCommandResult> {
  const cutMapPath = resolve(dependencies.cwd, input.cutMapPath);
  const revalidated = await revalidateV3DecomposeExecutionPreflight({
    readCutMap: async (path) => new Uint8Array(await readFile(path)),
    resolvePreflight: async (origin) => {
      const result = await createGitV3DecomposePreflight({
        cwd: dependencies.cwd,
        exec: dependencies.exec,
        readBlob: (ref, path) => dependencies.readBlob(ref, path),
      }, input.baseBranch, origin);
      return result.status === "ready"
        ? result
        : {
            status: "rejected",
            reason: result.reason,
            ...("locus" in result && result.locus !== undefined
              ? { locus: result.locus }
              : {}),
            ...("evidence" in result && result.evidence !== undefined
              ? { evidence: result.evidence }
              : {}),
          };
    },
  }, input.origin, cutMapPath);
  if (revalidated.status !== "current") {
    return {
      status: "refused",
      stage: "repository-plan",
      reason: revalidated.reason,
      locus: revalidated.locus,
      ...(revalidated.evidence === undefined ? {} : { evidence: revalidated.evidence }),
      recovery: { kind: "none" },
      remedy: `Re-preflight: ${renderV3DecomposePreflightCommand(input.origin)}`,
    };
  }
  if (revalidated.completedMap.authoring.shape === "extraction") {
    return {
      status: "refused",
      stage: "repository-plan",
      reason: "map:authoring-shape",
      locus: "authoring.shape",
      recovery: { kind: "none" },
      remedy: `Use the extraction mode: ${renderV3DecomposeExtractCommand(input.origin, cutMapPath)}`,
    };
  }
  const { source, resultBase } = revalidated.completedMap.machine;
  if (source.ref !== resultBase.ref) {
    const branch = source.logicalBranch;
    const expectedRef = `refs/heads/${branch}`;
    const live = source.ref === expectedRef
      ? await readLiveRemoteBranchTip({
          exec: async (command, args, options) => await dependencies.exec(command, args, {
            ...options,
            cwd: options?.cwd ?? dependencies.cwd,
          }),
          remote: "origin",
          branch,
        })
      : { reachable: true, tip: null };
    if (!live.reachable || live.tip !== source.head) {
      return {
        status: "refused",
        stage: "repository-plan",
        reason: "source-unpublished",
        locus: branch,
        recovery: { kind: "none" },
        remedy: "Publish the reported source branch to origin before retrying.",
      };
    }
  }
  const result = await executeGitV3DecomposeOperation(dependencies, {
    protection: input.protection,
    baseBranch: input.baseBranch,
    completedMap: revalidated.completedMap,
  });
  if (result.status === "refused") {
    if (isV3DecomposeMappedReason(result.reason)) {
      const locus = "locus" in result && typeof result.locus === "string"
        ? result.locus
        : undefined;
      return {
        ...result,
        remedy: v3DecomposeRemedy({
          invocation: { mode: "execute", origin: input.origin, cutMapPath },
          reason: result.reason,
          ...(locus === undefined ? {} : { locus }),
          recovery: result.recovery,
        }),
      };
    }
    let remedy: string;
    switch (result.recovery.kind) {
      case "full-candidate":
        remedy = `Clean the owned candidate at ${result.recovery.path}: `
          + `arc teardown --branch ${result.recovery.candidateBranch}. Then retry: `
          + renderV3DecomposeExecuteCommand(input.origin, cutMapPath);
        break;
      case "partial-restoration":
        remedy = result.recovery.status === "restored"
          ? `Retry: ${renderV3DecomposeExecuteCommand(input.origin, cutMapPath)}`
          : `Restore the reported transform-owned paths before retrying: ${
            result.recovery.affectedPaths.join(", ")
          }`;
        break;
      case "none":
        remedy = "No recovery command was authorized; resolve the reported refusal before retrying.";
        break;
    }
    return { ...result, remedy };
  }
  return result;
}

/**
 * Read one canonical extraction map, revalidate its provenance, and stage its additive result.
 *
 * @param dependencies - Exact Git/object readers plus the candidate worktree owner.
 * @param input - Closed extraction-command operands and configured repository policy.
 * @returns One prepared additive result or a closed refusal with exact recovery.
 */
export async function executeGitV3ExtractionCommand(
  dependencies: GitV3DecomposeOperationDependencies,
  input: GitV3DecomposeCommandInput,
): Promise<GitV3ExtractionCommandResult> {
  const cutMapPath = resolve(dependencies.cwd, input.cutMapPath);
  const revalidated = await revalidateV3DecomposeExecutionPreflight({
    readCutMap: async (path) => new Uint8Array(await readFile(path)),
    resolvePreflight: async (origin) => {
      const result = await createGitV3DecomposePreflight({
        cwd: dependencies.cwd,
        exec: dependencies.exec,
        readBlob: (ref, path) => dependencies.readBlob(ref, path),
      }, input.baseBranch, origin);
      return result.status === "ready"
        ? result
        : {
            status: "rejected",
            reason: result.reason,
            ...("locus" in result && result.locus !== undefined
              ? { locus: result.locus }
              : {}),
            ...("evidence" in result && result.evidence !== undefined
              ? { evidence: result.evidence }
              : {}),
          };
    },
  }, input.origin, cutMapPath);
  if (revalidated.status !== "current") {
    return {
      status: "refused",
      stage: "repository-plan",
      reason: revalidated.reason,
      locus: revalidated.locus,
      ...(revalidated.evidence === undefined ? {} : { evidence: revalidated.evidence }),
      recovery: { kind: "none" },
      remedy: `Re-preflight: ${renderV3DecomposePreflightCommand(input.origin)}`,
    };
  }
  if (revalidated.completedMap.authoring.shape !== "extraction") {
    return {
      status: "refused",
      stage: "repository-plan",
      reason: "map:authoring-shape",
      locus: "authoring.shape",
      recovery: { kind: "none" },
      remedy: `Use the retirement mode: ${renderV3DecomposeExecuteCommand(input.origin, cutMapPath)}`,
    };
  }
  const { source, resultBase } = revalidated.completedMap.machine;
  if (source.ref !== resultBase.ref) {
    const branch = source.logicalBranch;
    const expectedRef = `refs/heads/${branch}`;
    const live = source.ref === expectedRef
      ? await readLiveRemoteBranchTip({
          exec: async (command, args, options) => await dependencies.exec(command, args, {
            ...options,
            cwd: options?.cwd ?? dependencies.cwd,
          }),
          remote: "origin",
          branch,
        })
      : { reachable: true, tip: null };
    if (!live.reachable || live.tip !== source.head) {
      return {
        status: "refused",
        stage: "repository-plan",
        reason: "source-unpublished",
        locus: branch,
        recovery: { kind: "none" },
        remedy: "Publish the reported source branch to origin before retrying.",
      };
    }
  }
  const result = await executeGitV3ExtractionOperation(dependencies, {
    protection: input.protection,
    baseBranch: input.baseBranch,
    completedMap: revalidated.completedMap,
  });
  if (result.status === "refused") {
    let remedy: string;
    switch (result.recovery.kind) {
      case "full-candidate":
        remedy = `Clean the owned candidate at ${result.recovery.path}: `
          + `arc teardown --branch ${result.recovery.candidateBranch}. Then retry: `
          + renderV3DecomposeExtractCommand(input.origin, cutMapPath);
        break;
      case "partial-restoration":
        remedy = result.recovery.status === "restored"
          ? `Retry: ${renderV3DecomposeExtractCommand(input.origin, cutMapPath)}`
          : `Restore the reported transform-owned paths before retrying: ${
            result.recovery.affectedPaths.join(", ")
          }`;
        break;
      case "none":
        remedy = "No recovery command was authorized; resolve the reported refusal before retrying.";
        break;
    }
    return { ...result, remedy };
  }
  return result;
}
