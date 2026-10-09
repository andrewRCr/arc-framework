/** Repository-bound composition and execution of one immutable v3 decomposition result. */

import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";
import {
  nodeEditorDocumentsFs, writeEditorDocumentsOrThrow, type EditorDocumentsWriter,
} from "../schema-command/editor-documents.js";

import { canonicalDigest, canonicalize } from "../kernel/canonical/canonical-json.js";
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
  V3DecomposeOperationRecoverySchema,
  type V3DecomposeOperationRecovery,
  type V3DecomposeOperationResult,
  executeV3ExtractionOperation,
  type V3ExtractionOperationResult,
} from "./decompose-v3-operation.js";
import type { V3MaterializerIO } from "./decompose-v3-materializer.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import {
  V3DecomposeResultReportSchema,
  type V3DecomposeResultReport,
} from "./decompose-v3-result-report.js";
import { revalidateV3DecomposeExecutionPreflight } from "./decompose-v3-execution-preflight.js";
import { decodeV3DecomposeCutMap, type V3DecomposeCutMap } from "./decompose-v3-schema.js";
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
  V3DecomposeRefusalEvidenceSchema,
  v3DecomposeRemedy,
  type V3DecomposeRefusalEvidence,
} from "./decompose-v3-refusal.js";
import {
  SpineRemedySchema,
} from "../../scripts/integration/spine-refusal.js";

export interface GitV3DecomposeOperationDependencies extends GitV3RepositoryPlanDependencies {
  writeEditorDocuments?: EditorDocumentsWriter;
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

const V3StageRefusalFields = {
  status: z.literal("refused"),
  reason: z.string().min(1).refine((reason) => reason !== "unexpected-error"),
  locus: z.string().min(1).optional(),
  evidence: V3DecomposeRefusalEvidenceSchema.optional(),
  report: V3DecomposeResultReportSchema.optional(),
  recovery: V3DecomposeOperationRecoverySchema,
  remedy: SpineRemedySchema,
};

const V3UnexpectedCommandRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  reason: z.literal("unexpected-error"),
  locus: z.string().min(1).optional(),
  evidence: V3DecomposeRefusalEvidenceSchema.optional(),
  remedy: SpineRemedySchema,
});

/** Strict retirement-command refusal envelope, including report-bearing operation failures. */
export const GitV3DecomposeCommandRefusalSchema = z.union([
  z.strictObject({
    ...V3StageRefusalFields,
    stage: z.enum([
      "repository-plan",
      "occupation",
      "post-occupation-revalidation",
      "partial-capture",
      "materialization",
      "transition-record",
      "post-stage-revalidation",
      "restoration",
    ]),
  }),
  V3UnexpectedCommandRefusalSchema,
]);
export type GitV3DecomposeCommandRefusal = z.infer<
  typeof GitV3DecomposeCommandRefusalSchema
>;

export type GitV3DecomposeCommandResult =
  | Extract<GitV3DecomposeOperationResult, { status: "staged" }>
  | GitV3DecomposeCommandRefusal;

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

/** Strict extraction-command refusal envelope, excluding retirement history stages. */
export const GitV3ExtractionCommandRefusalSchema = z.union([
  z.strictObject({
    ...V3StageRefusalFields,
    stage: z.enum([
      "repository-plan",
      "occupation",
      "post-occupation-revalidation",
      "partial-capture",
      "materialization",
      "post-stage-revalidation",
      "restoration",
    ]),
  }),
  V3UnexpectedCommandRefusalSchema,
]);
export type GitV3ExtractionCommandRefusal = z.infer<
  typeof GitV3ExtractionCommandRefusalSchema
>;

export type GitV3ExtractionCommandResult =
  | Extract<GitV3ExtractionOperationResult, { status: "staged" }>
  | GitV3ExtractionCommandRefusal;

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

function repositoryPlanIdentity(
  result: GitV3RepositoryPlanResult & { status: "composed" },
): ReturnType<typeof canonicalDigest> {
  return canonicalDigest({
    plan: result.plan,
    sourceArtifactInventory: result.sourceArtifactInventory,
    extractionFacts: result.extractionFacts ?? null,
  });
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

type ComposedRepositoryPlan = Extract<GitV3RepositoryPlanResult, { status: "composed" }>;
type GitV3OperationIO = Awaited<ReturnType<typeof createGitV3DecomposeOperationIO>>;

type OperationRevalidationResult =
  | { status: "valid" }
  | {
      status: "refused";
      reason: string;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
    };

async function revalidateOperationPlan(
  dependencies: GitV3DecomposeOperationDependencies,
  input: GitV3DecomposeOperationInput,
  composed: ComposedRepositoryPlan,
  io: GitV3OperationIO,
  plan: ValidatedDecomposePlan,
  requireCleanProjection: boolean,
  extraction: boolean,
): Promise<OperationRevalidationResult> {
  const refreshed = extraction
    ? await composeGitV3ExtractionRepositoryPlan(
      dependencies,
      input.baseBranch,
      input.completedMap,
    )
    : await composeGitV3RepositoryPlan(dependencies, input.baseBranch, input.completedMap);
  if (refreshed.status === "refused") {
    return {
      status: "refused",
      reason: `${refreshed.refusal.stage}:${refreshed.refusal.reason}`,
      ...(refreshed.refusal.locus === undefined ? {} : { locus: refreshed.refusal.locus }),
      ...(refreshed.refusal.evidence === undefined ? {} : { evidence: refreshed.refusal.evidence }),
    };
  }
  const planDrifted = !exactPlan(plan, refreshed.plan)
    || !exactInventory(composed, refreshed)
    || (extraction && !exactExtractionFacts(composed, refreshed));
  if (planDrifted) {
    return {
      status: "refused",
      reason: "repository-plan-drift",
      locus: "planId",
      evidence: {
        expected: repositoryPlanIdentity(composed),
        actual: repositoryPlanIdentity(refreshed),
      },
    };
  }
  if (input.protection !== "partial" || !requireCleanProjection) return { status: "valid" };
  const projection = await io.occupation.inspectPartial(input.baseBranch, plan.allowedPaths);
  if (projection.baseHead === plan.expectedBaseHead
    && projection.indexClean
    && projection.worktreeClean) return { status: "valid" };
  return {
    status: "refused",
    reason: "partial-projection-drift",
    locus: input.baseBranch,
    evidence: {
      expected: {
        baseHead: plan.expectedBaseHead,
        indexClean: true,
        worktreeClean: true,
      },
      actual: {
        baseHead: projection.baseHead,
        indexClean: projection.indexClean,
        worktreeClean: projection.worktreeClean,
      },
    },
  };
}

function decodeRetirementOperationMap(completedMap: unknown):
  | { status: "ready"; value: V3DecomposeCutMap }
  | Extract<GitV3DecomposeOperationResult, { status: "refused" }> {
  const decoded = decodeV3DecomposeCutMap(completedMap);
  return decoded.status === "rejected"
    ? {
        status: "refused",
        stage: "repository-plan",
        reason: `map:${decoded.issue.code}`,
        locus: decoded.issue.path,
        recovery: { kind: "none" },
      }
    : { status: "ready", value: decoded.value };
}

async function provisionOccupiedEditorDocuments(
  occupied: DecomposeResultOccupationResult,
  dependencies: GitV3DecomposeOperationDependencies,
): Promise<DecomposeResultOccupationResult> {
  if (occupied.status === "occupied" && occupied.protection === "full") {
    await writeEditorDocumentsOrThrow(
      occupied.path, dependencies.exec, nodeEditorDocumentsFs, undefined, dependencies.writeEditorDocuments,
    );
  }
  return occupied;
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
  const completedMap = decodeRetirementOperationMap(input.completedMap);
  if (completedMap.status === "refused") return completedMap;
  const io = await createGitV3DecomposeOperationIO({
    cwd: dependencies.cwd,
    exec: dependencies.exec,
    spawningIdentity: dependencies.spawningIdentity,
    blobs: composed.blobs,
  });
  let targetCwd: string | null = null;
  const partialRecovery = io.partialRecovery(dependencies.cwd);
  const revalidate = async (plan: ValidatedDecomposePlan, requireCleanProjection: boolean) =>
    await revalidateOperationPlan(
      dependencies,
      input,
      composed,
      io,
      plan,
      requireCleanProjection,
      false,
    );
  const operation = await executeV3DecomposeOperation({
    protection: input.protection,
    configuredBase: input.baseBranch,
    plan: composed.plan,
    completedMap: completedMap.value,
  }, {
    occupy: async (occupationInput): Promise<DecomposeResultOccupationResult> => {
      const occupied = await provisionOccupiedEditorDocuments(await occupyDecomposeResult(occupationInput, io.occupation), dependencies);
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
  const revalidate = async (plan: ValidatedDecomposePlan, requireCleanProjection: boolean) =>
    await revalidateOperationPlan(
      dependencies,
      input,
      composed,
      io,
      plan,
      requireCleanProjection,
      true,
    );
  const operation = await executeV3ExtractionOperation({
    protection: input.protection,
    configuredBase: input.baseBranch,
    origin: completedMap.value.machine.source.origin,
    plan: composed.plan,
    extractionFacts: composed.extractionFacts,
  }, {
    occupy: async (occupationInput): Promise<DecomposeResultOccupationResult> => {
      const occupied = await provisionOccupiedEditorDocuments(await occupyDecomposeResult(occupationInput, io.occupation), dependencies);
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

type CommandRefusalStage =
  | "repository-plan"
  | "occupation"
  | "post-occupation-revalidation"
  | "partial-capture"
  | "materialization"
  | "transition-record"
  | "post-stage-revalidation"
  | "restoration";

interface CommandRefusalFacts {
  reason: string;
  stage?: CommandRefusalStage;
  locus?: string;
  evidence?: V3DecomposeRefusalEvidence;
  report?: V3DecomposeResultReport;
  recovery?: V3DecomposeOperationRecovery;
}

async function revalidateCommandMap(
  dependencies: GitV3DecomposeOperationDependencies,
  input: GitV3DecomposeCommandInput,
  cutMapPath: string,
): Promise<Awaited<ReturnType<typeof revalidateV3DecomposeExecutionPreflight>>> {
  return await revalidateV3DecomposeExecutionPreflight({
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
            ...("locus" in result && result.locus !== undefined ? { locus: result.locus } : {}),
            ...("evidence" in result && result.evidence !== undefined
              ? { evidence: result.evidence }
              : {}),
          };
    },
  }, input.origin, cutMapPath);
}

function composeDecomposeCommandRefusal(
  input: GitV3DecomposeCommandInput,
  cutMapPath: string,
  facts: CommandRefusalFacts,
): GitV3DecomposeCommandRefusal {
  const invocation = { mode: "execute" as const, origin: input.origin, cutMapPath };
  if (facts.reason === "unexpected-error") {
    return GitV3DecomposeCommandRefusalSchema.parse({
      status: "refused",
      reason: facts.reason,
      ...(facts.locus === undefined ? {} : { locus: facts.locus }),
      ...(facts.evidence === undefined ? {} : { evidence: facts.evidence }),
      remedy: v3DecomposeRemedy({ invocation, reason: facts.reason, locus: facts.locus }),
    });
  }
  const refusal = {
    status: "refused" as const,
    stage: facts.stage ?? "repository-plan",
    reason: facts.reason,
    ...(facts.locus === undefined ? {} : { locus: facts.locus }),
    ...(facts.evidence === undefined ? {} : { evidence: facts.evidence }),
    ...(facts.report === undefined ? {} : { report: facts.report }),
    recovery: facts.recovery ?? { kind: "none" as const },
  };
  return GitV3DecomposeCommandRefusalSchema.parse({
    ...refusal,
    remedy: v3DecomposeRemedy({
      invocation,
      reason: refusal.reason,
      ...(refusal.locus === undefined ? {} : { locus: refusal.locus }),
      recovery: refusal.recovery,
    }),
  });
}

function composeExtractionCommandRefusal(
  input: GitV3DecomposeCommandInput,
  cutMapPath: string,
  facts: CommandRefusalFacts,
): GitV3ExtractionCommandRefusal {
  const invocation = { mode: "extract" as const, origin: input.origin, cutMapPath };
  if (facts.reason === "unexpected-error") {
    return GitV3ExtractionCommandRefusalSchema.parse({
      status: "refused",
      reason: facts.reason,
      ...(facts.locus === undefined ? {} : { locus: facts.locus }),
      ...(facts.evidence === undefined ? {} : { evidence: facts.evidence }),
      remedy: v3DecomposeRemedy({ invocation, reason: facts.reason, locus: facts.locus }),
    });
  }
  const refusal = {
    status: "refused" as const,
    stage: facts.stage ?? "repository-plan",
    reason: facts.reason,
    ...(facts.locus === undefined ? {} : { locus: facts.locus }),
    ...(facts.evidence === undefined ? {} : { evidence: facts.evidence }),
    ...(facts.report === undefined ? {} : { report: facts.report }),
    recovery: facts.recovery ?? { kind: "none" as const },
  };
  return GitV3ExtractionCommandRefusalSchema.parse({
    ...refusal,
    remedy: v3DecomposeRemedy({
      invocation,
      reason: refusal.reason,
      ...(refusal.locus === undefined ? {} : { locus: refusal.locus }),
      recovery: refusal.recovery,
    }),
  });
}

async function sourcePublicationRefusal(
  dependencies: GitV3DecomposeOperationDependencies,
  map: V3DecomposeCutMap,
): Promise<CommandRefusalFacts | null> {
  const { source, resultBase } = map.machine;
  if (source.ref === resultBase.ref) return null;
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
  if (live.reachable && live.tip === source.head) return null;
  return {
    stage: "repository-plan",
    reason: "source-unpublished",
    locus: branch,
    evidence: {
      expected: source.head,
      actual: live.reachable && live.tip !== null ? live.tip : { kind: "absent" },
    },
    recovery: { kind: "none" },
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
  const revalidated = await revalidateCommandMap(dependencies, input, cutMapPath);
  if (revalidated.status !== "current") {
    return composeDecomposeCommandRefusal(input, cutMapPath, {
      reason: revalidated.reason,
      locus: revalidated.locus,
      ...(revalidated.evidence === undefined ? {} : { evidence: revalidated.evidence }),
      ...(revalidated.reason === "unexpected-error" ? {} : {
        stage: "repository-plan" as const,
        recovery: { kind: "none" as const },
      }),
    });
  }
  if (revalidated.completedMap.authoring.shape === "extraction") {
    return composeDecomposeCommandRefusal(input, cutMapPath, {
      stage: "repository-plan",
      reason: "map:authoring-shape",
      locus: "authoring.shape",
      recovery: { kind: "none" },
    });
  }
  const unpublished = await sourcePublicationRefusal(dependencies, revalidated.completedMap);
  if (unpublished !== null) return composeDecomposeCommandRefusal(input, cutMapPath, unpublished);
  const result = await executeGitV3DecomposeOperation(dependencies, {
    protection: input.protection,
    baseBranch: input.baseBranch,
    completedMap: revalidated.completedMap,
  });
  if (result.status === "refused") {
    return composeDecomposeCommandRefusal(input, cutMapPath, result);
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
  const revalidated = await revalidateCommandMap(dependencies, input, cutMapPath);
  if (revalidated.status !== "current") {
    return composeExtractionCommandRefusal(input, cutMapPath, {
      reason: revalidated.reason,
      locus: revalidated.locus,
      ...(revalidated.evidence === undefined ? {} : { evidence: revalidated.evidence }),
      ...(revalidated.reason === "unexpected-error" ? {} : {
        stage: "repository-plan" as const,
        recovery: { kind: "none" as const },
      }),
    });
  }
  if (revalidated.completedMap.authoring.shape !== "extraction") {
    return composeExtractionCommandRefusal(input, cutMapPath, {
      stage: "repository-plan",
      reason: "map:authoring-shape",
      locus: "authoring.shape",
      recovery: { kind: "none" },
    });
  }
  const unpublished = await sourcePublicationRefusal(dependencies, revalidated.completedMap);
  if (unpublished !== null) return composeExtractionCommandRefusal(input, cutMapPath, unpublished);
  const result = await executeGitV3ExtractionOperation(dependencies, {
    protection: input.protection,
    baseBranch: input.baseBranch,
    completedMap: revalidated.completedMap,
  });
  if (result.status === "refused") {
    return composeExtractionCommandRefusal(input, cutMapPath, result);
  }
  return result;
}
