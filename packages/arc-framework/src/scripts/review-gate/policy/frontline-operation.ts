/** Durable replay and invalidation policy for non-evidentiary frontline runs. */

import { z } from "zod";

import { canonicalDigest, canonicalize } from "../../../lib/kernel/index.js";
import {
  createFrontlineOutcomeRecord,
  FrontlineOutcomeRecordSchema,
  type FrontlineExecutableIdentity,
  type FrontlineOutcomeRecord,
} from "../core/advisory-records.js";
import {
  FrontlineAdmissionSchema,
  type FrontlineAdmission,
} from "../core/frontline-admission.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { BoundFrontlineResponseBinding } from "../core/frontline-response-binding.js";
import {
  FrontlineRunStateSchema,
  type FrontlineRunState,
} from "../core/operation-state-schema.js";
import type {
  FrontlineOutcomeStore,
  ReviewOperationStateStore,
} from "../core/ports.js";
import {
  isReviewVersionConflict,
  REVIEW_VERSION_RETRY_ATTEMPTS,
} from "../core/version-conflict.js";
import {
  FrontlineExecutionOutcomeSchema,
  type FrontlineExecutionOutcome,
} from "./frontline-outcome.js";
import {
  FrontlineSourceDescriptorSchema,
  type FrontlineSourceDescriptor,
} from "./frontline-source.js";

const GenerationSchema = z.number().int().nonnegative();
const TimestampSchema = z.iso.datetime({ offset: true });

export interface FrontlineRunBindingInput {
  admission: FrontlineAdmission;
  responseBinding?: BoundFrontlineResponseBinding;
}

interface FrontlineRunBinding {
  admission: FrontlineAdmission;
  target: ReviewTarget;
  source: FrontlineSourceDescriptor;
  operationId: string;
  sourceBindingId: string;
  responseBinding?: BoundFrontlineResponseBinding;
}

/**
 * Bind the executable source and optional Candidate/member response authority as one identity.
 *
 * @param sourceInput - The normalized frontline source selected for the run.
 * @param responseBinding - Candidate/member authority retained by pre-publication, when present.
 * @returns The canonical source-binding digest used by operation state and response validation.
 */
export function computeFrontlineSourceBindingId(
  sourceInput: FrontlineSourceDescriptor,
  responseBinding?: BoundFrontlineResponseBinding,
): string {
  const source = FrontlineSourceDescriptorSchema.parse(sourceInput);
  return canonicalDigest(responseBinding === undefined
    ? {
        domain: "arc.review-gate.frontline-source-binding/v1",
        source,
      }
    : {
        domain: "arc.review-gate.frontline-source-binding/v1",
        source,
        responseBinding,
      });
}

export type FrontlineRunResolution =
  | {
      action: "execute";
      operationId: string;
      expectedVersion: number;
      invalidatedBy: Array<"policy" | "source-binding">;
      priorState?: FrontlineRunState;
    }
  | {
      action: "reuse";
      operationId: string;
      version: number;
      state: FrontlineRunState;
    }
  | {
      action: "blocked";
      operationId: string;
      reason: "operation-identity-conflict";
    };

function bindFrontlineRun(input: FrontlineRunBindingInput): FrontlineRunBinding {
  const admission = FrontlineAdmissionSchema.parse(input.admission);
  if (admission.frontlineReview.source === null) {
    throw new Error("frontline admission requires one executable source");
  }
  const target = admission.target;
  const source = FrontlineSourceDescriptorSchema.parse(admission.frontlineReview.source);
  const operationId = admission.operationId;
  const sourceBindingId = computeFrontlineSourceBindingId(source, input.responseBinding);
  return { admission, target, source, operationId, sourceBindingId,
    ...(input.responseBinding === undefined ? {} : { responseBinding: input.responseBinding }) };
}

/** Resolve whether an exact frontline run may reuse durable operational state. */
export async function resolveFrontlineRun(
  store: ReviewOperationStateStore,
  input: FrontlineRunBindingInput,
): Promise<FrontlineRunResolution> {
  const binding = bindFrontlineRun(input);
  const current = await store.readOperation(binding.operationId);
  if (current.state === null) {
    return { action: "execute", operationId: binding.operationId, expectedVersion: 0, invalidatedBy: [] };
  }
  if (
    current.state.kind !== "frontline-run"
    || current.state.repositoryId !== binding.target.repositoryId
    || current.state.targetId !== binding.target.targetId
    || current.state.sourceIdentity !== binding.source.sourceId
    || canonicalize(current.state.lineage) !== canonicalize(binding.admission.lineage)
    || current.state.logicalPass !== binding.admission.logicalPass
    || current.state.retryGeneration !== binding.admission.retryGeneration
    || canonicalize(current.state.responseBinding ?? null) !== canonicalize(binding.responseBinding ?? null)
  ) {
    return { action: "blocked", operationId: binding.operationId, reason: "operation-identity-conflict" };
  }
  const invalidatedBy: Array<"policy" | "source-binding"> = [];
  if (current.state.policyVersion !== binding.admission.policyVersion) invalidatedBy.push("policy");
  if (current.state.sourceBindingId !== binding.sourceBindingId) invalidatedBy.push("source-binding");
  if (invalidatedBy.length > 0) {
    return { action: "blocked", operationId: binding.operationId, reason: "operation-identity-conflict" };
  }
  return {
    action: "reuse",
    operationId: binding.operationId,
    version: current.version,
    state: FrontlineRunStateSchema.parse(current.state),
  };
}

function createFrontlineRunState(
  binding: FrontlineRunBinding,
  updatedAt: string,
  outcome: FrontlineRunState["outcome"],
): FrontlineRunState {
  return FrontlineRunStateSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    operationId: binding.operationId,
    updatedAt: TimestampSchema.parse(updatedAt),
    kind: "frontline-run",
    repositoryId: binding.target.repositoryId,
    targetId: binding.target.targetId,
    sourceIdentity: binding.source.sourceId,
    lineage: binding.admission.lineage,
    logicalPass: binding.admission.logicalPass,
    retryGeneration: binding.admission.retryGeneration,
    outcome,
    policyVersion: binding.admission.policyVersion,
    sourceBindingId: binding.sourceBindingId,
    ...(binding.responseBinding === undefined ? {} : { responseBinding: binding.responseBinding }),
  });
}

/** Publish the in-flight marker before invoking the selected carrier effect. */
export async function persistFrontlineRunPending(
  store: ReviewOperationStateStore,
  input: FrontlineRunBindingInput & {
    updatedAt: string;
    expectedVersion: number;
  },
): Promise<{ version: number; state: FrontlineRunState }> {
  const binding = bindFrontlineRun(input);
  const state = createFrontlineRunState(binding, input.updatedAt, "pending");
  const published = await store.publishOperation(state, GenerationSchema.parse(input.expectedVersion));
  return { version: published.version, state };
}

/** Persist one normalized frontline outcome through the versioned operation-state port. */
export async function persistFrontlineRunOutcome(
  store: ReviewOperationStateStore,
  input: FrontlineRunBindingInput & {
    outcome: FrontlineExecutionOutcome;
    updatedAt: string;
    expectedVersion: number;
  },
): Promise<{ version: number; state: FrontlineRunState }> {
  const binding = bindFrontlineRun(input);
  const outcome = FrontlineExecutionOutcomeSchema.parse(input.outcome);
  if (
    canonicalize(outcome.target) !== canonicalize(binding.target)
    || canonicalize(outcome.source) !== canonicalize(binding.source)
    || outcome.pass !== binding.admission.logicalPass
    || outcome.maxPasses !== binding.admission.maxPasses
  ) {
    throw new Error("frontline outcome does not match operation binding");
  }
  const state = createFrontlineRunState(binding, input.updatedAt, outcome.outcome);
  const published = await store.publishOperation(state, GenerationSchema.parse(input.expectedVersion));
  return { version: published.version, state };
}

export interface FrontlineRunExecutionDependencies {
  operationStore: ReviewOperationStateStore;
  outcomeStore: FrontlineOutcomeStore;
  withOperationLock<T>(
    operationId: string,
    maxWaitMs: number,
    action: () => Promise<T>,
  ): Promise<T>;
  execute(): Promise<{
    outcome: FrontlineExecutionOutcome;
    executableIdentity: FrontlineExecutableIdentity | null;
  }>;
  now(): string;
}

export interface FrontlineRunExecutionInput extends FrontlineRunBindingInput {
  lockWaitMs: number;
  retryOfOperationId?: string;
}

/** Stable corruption failure for a completion claim without its exact durable outcome. */
export class FrontlineOperationCorruptStateError extends Error {
  readonly code = "corrupt-state" as const;

  constructor(message: string) {
    super(message);
    this.name = "FrontlineOperationCorruptStateError";
  }
}

/** A provider effect may have started, so replay needs an explicit new request. */
export class FrontlineOperationUncertainError extends Error {
  readonly code = "uncertain-provider-execution" as const;

  constructor(operationId: string) {
    super(
      `Frontline operation '${operationId}' has no completed outcome. The provider may have started; `
      + `inspect it before submitting a new request with retryOfOperationId: '${operationId}'.`,
    );
    this.name = "FrontlineOperationUncertainError";
  }
}

/** A requested new review does not bind one eligible prior exact operation. */
export class FrontlineOperationRetryError extends Error {
  readonly code = "invalid-input" as const;

  constructor(message: string) {
    super(message);
    this.name = "FrontlineOperationRetryError";
  }
}

interface BoundPersistedOutcome {
  version: number;
  record: FrontlineOutcomeRecord;
  outcomeRef: string;
}

type FrontlineRunTerminal = {
  operationId: string;
  persistedVersion: number;
  target: ReviewTarget;
  outcomeRef: string;
  outcomeDigest: string;
  executableIdentity: FrontlineExecutableIdentity | null;
  outcome: FrontlineExecutionOutcome;
};

function matchesPriorOutcomeBinding(
  record: FrontlineOutcomeRecord,
  state: FrontlineRunState,
): boolean {
  return computeFrontlineSourceBindingId(record.outcome.source, record.responseBinding)
      === state.sourceBindingId
    && record.outcome.source.sourceId === state.sourceIdentity
    && canonicalize(record.responseBinding ?? null) === canonicalize(state.responseBinding ?? null);
}

function matchesRunOutcomeBinding(
  record: FrontlineOutcomeRecord,
  input: FrontlineRunExecutionInput,
  operationId: string,
  priorState?: FrontlineRunState,
): boolean {
  return record.operationId === operationId
    && record.repositoryId === input.admission.target.repositoryId
    && record.sourceIdentity === input.admission.frontlineReview.source?.sourceId
    && canonicalize(record.outcome.target) === canonicalize(input.admission.target)
    && canonicalize(record.outcome.source) === canonicalize(input.admission.frontlineReview.source)
    && record.outcome.pass === input.admission.logicalPass
    && record.outcome.maxPasses === input.admission.maxPasses
    && canonicalize(record.responseBinding ?? null) === canonicalize(input.responseBinding ?? null)
    && (priorState === undefined || matchesPriorOutcomeBinding(record, priorState));
}

async function readBoundOutcome(
  store: FrontlineOutcomeStore,
  input: FrontlineRunExecutionInput,
  operationId: string,
  required: boolean,
  priorState?: FrontlineRunState,
): Promise<BoundPersistedOutcome | null> {
  let persisted: Awaited<ReturnType<FrontlineOutcomeStore["readOutcome"]>>;
  try {
    persisted = await store.readOutcome(operationId);
  } catch (error) {
    throw new FrontlineOperationCorruptStateError(
      `frontline outcome '${operationId}' cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (persisted.record === null && persisted.outcomeRef === null && persisted.version === 0) {
    if (!required) return null;
    throw new FrontlineOperationCorruptStateError(
      `frontline operation '${operationId}' claims completion without an outcome`,
    );
  }
  if (persisted.record === null || persisted.outcomeRef === null || persisted.version <= 0) {
    throw new FrontlineOperationCorruptStateError(
      `frontline outcome '${operationId}' has incomplete durable coordinates`,
    );
  }
  let record: FrontlineOutcomeRecord;
  try {
    record = FrontlineOutcomeRecordSchema.parse(persisted.record);
  } catch {
    throw new FrontlineOperationCorruptStateError(
      `frontline outcome '${operationId}' is malformed`,
    );
  }
  if (!matchesRunOutcomeBinding(record, input, operationId, priorState)) {
    throw new FrontlineOperationCorruptStateError(
      `frontline outcome '${operationId}' does not match its operation binding`,
    );
  }
  return {
    version: persisted.version,
    record,
    outcomeRef: persisted.outcomeRef,
  };
}

function priorRetryMatches(
  prior: FrontlineRunState | null,
  binding: FrontlineRunBinding,
  priorOperationId: string,
): prior is FrontlineRunState {
  return priorOperationId !== binding.operationId
    && prior?.kind === "frontline-run"
    && prior.repositoryId === binding.target.repositoryId
    && prior.targetId === binding.target.targetId
    && canonicalize(prior.lineage) === canonicalize(binding.admission.lineage)
    && prior.logicalPass === binding.admission.logicalPass
    && prior.retryGeneration < binding.admission.retryGeneration;
}

async function validateExplicitRetry(
  dependencies: FrontlineRunExecutionDependencies,
  input: FrontlineRunExecutionInput,
  binding: FrontlineRunBinding,
): Promise<void> {
  if (input.retryOfOperationId === undefined) return;
  const prior = await dependencies.operationStore.readOperation(input.retryOfOperationId);
  const priorState = prior.state?.kind === "frontline-run" ? prior.state : null;
  if (!priorRetryMatches(priorState,
    binding, input.retryOfOperationId)) {
    throw new FrontlineOperationRetryError("retry does not bind an earlier exact admitted operation");
  }
  if (priorState.outcome === "clean" || priorState.outcome === "findings") {
    throw new FrontlineOperationRetryError("retry requires an inconclusive prior operation");
  }
  if (priorState.outcome !== "pending") return;
  const priorOutcome = await dependencies.outcomeStore.readOutcome(input.retryOfOperationId);
  if (priorOutcome.record === null) return;
  const record = FrontlineOutcomeRecordSchema.parse(priorOutcome.record);
  if (record.operationId !== input.retryOfOperationId
    || record.outcome.target.targetId !== priorState.targetId
    || record.outcome.pass !== priorState.logicalPass
    || !matchesPriorOutcomeBinding(record, priorState)) {
    throw new FrontlineOperationCorruptStateError("prior frontline outcome does not match its admission");
  }
  await dependencies.operationStore.publishOperation(FrontlineRunStateSchema.parse({
    ...priorState,
    updatedAt: dependencies.now(),
    outcome: record.outcome.outcome,
  }), prior.version);
}

function terminalFromRecord(
  persistedVersion: number,
  target: ReviewTarget,
  persisted: BoundPersistedOutcome,
): FrontlineRunTerminal {
  return {
    operationId: persisted.record.operationId,
    persistedVersion,
    target,
    outcomeRef: persisted.outcomeRef,
    outcomeDigest: persisted.record.outcomeDigest,
    executableIdentity: persisted.record.executableIdentity,
    outcome: persisted.record.outcome,
  };
}

async function executeAndPersistFrontlineRun(
  dependencies: FrontlineRunExecutionDependencies,
  input: FrontlineRunExecutionInput,
  operationId: string,
  stateVersion: number,
  publishPending: boolean,
): Promise<FrontlineRunTerminal> {
  const binding = bindFrontlineRun(input);
  const expectedTerminalVersion = publishPending
    ? (await persistFrontlineRunPending(dependencies.operationStore, {
        ...input,
        updatedAt: dependencies.now(),
        expectedVersion: stateVersion,
      })).version
    : stateVersion;
  const executed = await dependencies.execute();
  const outcome = FrontlineExecutionOutcomeSchema.parse(executed.outcome);
  if (outcome.pass !== input.admission.logicalPass || outcome.maxPasses !== input.admission.maxPasses) {
    throw new Error("frontline outcome does not match the authorized pass");
  }
  const record = createFrontlineOutcomeRecord({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: binding.target.repositoryId,
    operationId,
    sourceIdentity: binding.source.sourceId,
    executableIdentity: executed.executableIdentity,
    outcome,
    ...(input.responseBinding === undefined ? {} : { responseBinding: input.responseBinding }),
  });
  const currentOutcome = await dependencies.outcomeStore.readOutcome(operationId);
  const appended = await dependencies.outcomeStore.appendOutcome(record, currentOutcome.version);
  const terminal = await persistFrontlineRunOutcome(dependencies.operationStore, {
    ...input,
    outcome,
    updatedAt: dependencies.now(),
    expectedVersion: expectedTerminalVersion,
  });
  return {
    operationId,
    persistedVersion: terminal.version,
    target: binding.target,
    outcomeRef: appended.outcomeRef,
    outcomeDigest: record.outcomeDigest,
    executableIdentity: record.executableIdentity,
    outcome,
  };
}

/** Publish pending, execute, durably record the result, then publish terminal operation state. */
export async function executeFrontlineRun(
  dependencies: FrontlineRunExecutionDependencies,
  input: FrontlineRunExecutionInput,
): Promise<FrontlineRunTerminal> {
  const binding = bindFrontlineRun(input);
  const operationId = binding.operationId;
  return await dependencies.withOperationLock(operationId, input.lockWaitMs, async () => {
    await validateExplicitRetry(dependencies, input, binding);
    for (let retry = 0; retry < REVIEW_VERSION_RETRY_ATTEMPTS; retry += 1) {
      try {
        const resolution = await resolveFrontlineRun(dependencies.operationStore, input);
        if (resolution.action === "blocked") {
          throw new FrontlineOperationCorruptStateError(
            `frontline operation '${resolution.operationId}' has a conflicting identity`,
          );
        }
        if (resolution.action === "execute") {
          if (resolution.invalidatedBy.length > 0) {
            throw new FrontlineOperationCorruptStateError(
              `frontline operation '${resolution.operationId}' has a conflicting admitted binding`,
            );
          }
          return await executeAndPersistFrontlineRun(
            dependencies,
            input,
            resolution.operationId,
            resolution.expectedVersion,
            true,
          );
        }

        const persisted = await readBoundOutcome(
          dependencies.outcomeStore,
          input,
          resolution.operationId,
          resolution.state.outcome !== "pending",
          resolution.state,
        );
        if (resolution.state.outcome === "pending") {
          if (persisted === null) {
            throw new FrontlineOperationUncertainError(resolution.operationId);
          }
          const recovered = await persistFrontlineRunOutcome(dependencies.operationStore, {
            ...input,
            outcome: persisted.record.outcome,
            updatedAt: dependencies.now(),
            expectedVersion: resolution.version,
          });
          return terminalFromRecord(recovered.version, binding.target, persisted);
        }
        if (persisted === null) {
          throw new FrontlineOperationCorruptStateError(
            `frontline operation '${resolution.operationId}' claims completion without an outcome`,
          );
        }
        if (
          resolution.state.outcome !== persisted.record.outcome.outcome
          || resolution.state.logicalPass !== persisted.record.outcome.pass
        ) {
          throw new FrontlineOperationCorruptStateError(
            `frontline operation '${resolution.operationId}' does not match its outcome`,
          );
        }
        return terminalFromRecord(resolution.version, binding.target, persisted);
      } catch (error) {
        if (!isReviewVersionConflict(error)) throw error;
      }
    }
    throw new Error(
      `frontline operation generation ${binding.admission.retryGeneration} exceeded version-conflict retry attempts`,
    );
  });
}
