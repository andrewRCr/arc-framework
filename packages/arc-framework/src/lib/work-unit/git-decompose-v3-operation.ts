/** Repository-bound composition and execution of one immutable v3 decomposition result. */

import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { canonicalize } from "../canonical/canonical-json.js";
import { validateManagedPath } from "../canonical/managed-path.js";
import { readGitBlobBytes } from "../io-context.js";
import {
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
  type V3DecomposeOperationRecovery,
  type V3DecomposeOperationResult,
} from "./decompose-v3-operation.js";
import type { V3MaterializerIO } from "./decompose-v3-materializer.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import {
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import { revalidateV3DecomposeExecutionPreflight } from "./decompose-v3-execution-preflight.js";
import { decodeV3DecomposeCutMap } from "./decompose-v3-schema.js";
import {
  createInRepoDecomposeRetirementDriver,
} from "./decompose-retirement-driver.js";
import type { PreparedV3DecomposeRetirement } from "./decompose-preparation.js";
import {
  createGitV3DecomposeOperationIO,
} from "./git-decompose-v3-operation-io.js";
import {
  resolveRetirementRecordPath,
  writeRetirementRecord,
} from "./retirement-record-store.js";
import {
  resolveTransitionRecordPath,
  writeTransitionRecord,
} from "./transition-record-store.js";
import type { ProtectionMode } from "../git/write-context.js";
import { createGitV3DecomposePreflight } from "./git-decompose-v3-preflight.js";
import { readLiveRemoteBranchTip } from "../git/remote-ref-reader.js";
import {
  renderV3DecomposeDiscardCommand,
  renderV3DecomposeExecuteCommand,
  renderV3DecomposeFinalizeCommand,
  renderV3DecomposePreflightCommand,
} from "./decompose-command-renderer.js";

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
      status: "prepared";
      plan: ValidatedDecomposePlan;
      operation: Extract<V3DecomposeOperationResult, { status: "prepared" }>;
      durablePreparation: PreparedV3DecomposeRetirement;
    }
  | {
      status: "refused";
      stage: "repository-plan";
      reason: string;
      locus?: string;
      recovery: { kind: "none" };
    }
  | Extract<V3DecomposeOperationResult, { status: "refused" }>;

export type GitV3DecomposeCommandResult =
  | (Extract<GitV3DecomposeOperationResult, { status: "prepared" }> & {
      discard:
        | {
            kind: "discard-candidate";
            command: string;
          }
        | {
            kind: "not-applicable";
            protection: "partial";
          };
      next: {
        kind: "finalize-with-continuation";
        continuationPath: string;
        command: string;
      };
    })
  | (Extract<GitV3DecomposeOperationResult, { status: "refused" }> & {
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
    applyAndStageFinal: async (path, state, bytes) => {
      await resolve().applyAndStageFinal(path, state, bytes);
    },
  };
}

function placeholderFor(
  composed: GitV3RepositoryPlanResult & { status: "composed" },
): { path: string; bytes: Uint8Array } | null {
  const mutation = composed.plan.mutations.find((candidate) =>
    candidate.kind === "exclusive" && candidate.role === "receipt-evidence");
  if (mutation?.after.kind !== "file") return null;
  const expectedDigest = mutation.after.contentDigest;
  const blob = composed.blobs.find(({ contentDigest }) =>
    contentDigest === expectedDigest);
  return blob === undefined ? null : { path: mutation.path, bytes: new Uint8Array(blob.bytes) };
}

async function persistPreparation(
  dependencies: GitV3DecomposeOperationDependencies,
  targetCwd: string,
  placeholder: { path: string; bytes: Uint8Array },
  preparation: V3DecomposePreparation,
  writeAndStage: (
    cwd: string,
    path: string,
    bytes: Uint8Array,
    mode: "100644" | "100755",
  ) => Promise<void>,
): Promise<
  | { status: "persisted"; durable: PreparedV3DecomposeRetirement }
  | { status: "refused"; reason: string }
> {
  const canonical = new TextEncoder().encode(canonicalize(preparation));
  try {
    await writeAndStage(targetCwd, placeholder.path, canonical, "100644");
    const driver = createInRepoDecomposeRetirementDriver({
      cwd: targetCwd,
      exec: dependencies.exec,
      readFile: async (path) => await readFile(path, "utf8"),
      readBlob: async (ref, path) =>
        await readGitBlobBytes(targetCwd, ref, validateManagedPath(path)),
      createRecord: async (receiptId, content) => {
        await writeRetirementRecord(targetCwd, receiptId, content);
      },
      removeRecord: async (receiptId) => {
        await rm(resolveRetirementRecordPath(targetCwd, receiptId));
      },
      createTransitionRecord: async (record) => {
        await writeTransitionRecord(targetCwd, record);
      },
      removeTransitionRecord: async (origin) => {
        await rm(resolveTransitionRecordPath(targetCwd, origin));
      },
    });
    const persisted = await driver.prepareV3(preparation);
    if (persisted.status === "prepared") {
      return { status: "persisted", durable: persisted.preparation };
    }
    await writeAndStage(targetCwd, placeholder.path, placeholder.bytes, "100644");
    return { status: "refused", reason: persisted.reason };
  } catch (error) {
    try {
      await writeAndStage(targetCwd, placeholder.path, placeholder.bytes, "100644");
    } catch {
      return { status: "refused", reason: "preparation-persistence-rollback-failed" };
    }
    return {
      status: "refused",
      reason: error instanceof Error ? error.message : "preparation-persistence-failed",
    };
  }
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
  const placeholder = placeholderFor(composed);
  if (placeholder === null) {
    return {
      status: "refused",
      stage: "repository-plan",
      reason: "composition:receipt-placeholder-missing",
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
  const persistence = { durable: null as PreparedV3DecomposeRetirement | null };
  const partialRecovery = io.partialRecovery(dependencies.cwd);
  const operation = await executeV3DecomposeOperation({
    protection: input.protection,
    configuredBase: input.baseBranch,
    plan: composed.plan,
    completedMap: completedMap.value,
    sourceArtifactInventory: composed.sourceArtifactInventory,
  }, {
    occupy: async (occupationInput): Promise<DecomposeResultOccupationResult> => {
      const occupied = await occupyDecomposeResult(occupationInput, io.occupation);
      if (occupied.status === "occupied") {
        targetCwd = occupied.protection === "full" ? occupied.path : dependencies.cwd;
      }
      return occupied;
    },
    revalidate: async (plan) => {
      const refreshed = await composeGitV3RepositoryPlan(
        dependencies,
        input.baseBranch,
        input.completedMap,
      );
      if (refreshed.status === "refused") {
        return {
          status: "refused",
          reason: `${refreshed.refusal.stage}:${refreshed.refusal.reason}`,
        };
      }
      if (!exactPlan(plan, refreshed.plan) || !exactInventory(composed, refreshed)) {
        return { status: "refused", reason: "repository-plan-drift" };
      }
      if (input.protection === "partial") {
        const projection = await io.occupation.inspectPartial(
          input.baseBranch,
          plan.allowedPaths,
        );
        if (projection.baseHead !== plan.expectedBaseHead
          || !projection.indexClean
          || !projection.worktreeClean) {
          return { status: "refused", reason: "partial-projection-drift" };
        }
      }
      return { status: "valid" };
    },
    materializer: materializerProxy(
      () => targetCwd,
      (cwd) => io.materializer(cwd),
    ),
    ...(input.protection === "partial" ? { partialRecovery } : {}),
    persist: async (preparation) => {
      if (targetCwd === null) {
        return { status: "refused", reason: "result-locus-unavailable" };
      }
      const persisted = await persistPreparation(
        dependencies,
        targetCwd,
        placeholder,
        preparation,
        async (cwd, path, bytes, mode) => {
          await io.writeAndStage(cwd, path, bytes, mode);
        },
      );
      if (persisted.status === "refused") return persisted;
      persistence.durable = persisted.durable;
      return { status: "persisted" };
    },
  });
  if (operation.status === "refused") return operation;
  if (persistence.durable === null) {
    const recovery: V3DecomposeOperationRecovery = operation.occupation.protection === "full"
      ? {
          kind: "full-candidate",
          path: operation.occupation.path,
          candidateOwnership: operation.occupation.candidateOwnership,
          retry: { kind: "retry", planId: composed.plan.planId },
          discard: {
            kind: "discard",
            origin: composed.plan.prospectiveOverlay.origin,
            cutMapDigest: composed.plan.cutMapDigest,
          },
        }
      : { kind: "none" };
    return {
      status: "refused",
      stage: "persistence",
      reason: "durable-preparation-unavailable",
      report: operation.report,
      recovery,
    };
  }
  return {
    status: "prepared",
    plan: composed.plan,
    operation,
    durablePreparation: persistence.durable,
  };
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
          };
    },
  }, input.origin, cutMapPath);
  if (revalidated.status !== "current") {
    return {
      status: "refused",
      stage: "repository-plan",
      reason: revalidated.reason,
      locus: revalidated.locus,
      recovery: { kind: "none" },
      remedy: `Re-preflight: ${renderV3DecomposePreflightCommand(input.origin)}`,
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
    let remedy: string;
    switch (result.recovery.kind) {
      case "full-candidate":
        remedy = [
          `Retry: ${renderV3DecomposeExecuteCommand(input.origin, cutMapPath)}`,
          `Discard: ${renderV3DecomposeDiscardCommand(input.origin, cutMapPath)}`,
        ].join("\n");
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
  const continuationPath = `${cutMapPath}.continuation.json`;
  return {
    ...result,
    discard: result.operation.occupation.protection === "full"
      ? {
          kind: "discard-candidate",
          command: renderV3DecomposeDiscardCommand(input.origin, cutMapPath),
        }
      : { kind: "not-applicable", protection: "partial" },
    next: {
      kind: "finalize-with-continuation",
      continuationPath,
      command: renderV3DecomposeFinalizeCommand(
        input.origin,
        result.operation.preparation.receiptId,
        continuationPath,
      ),
    },
  };
}
