/** Durable replay and invalidation policy for non-evidentiary frontline runs. */

import { z } from "zod";

import { canonicalDigest, canonicalize } from "../../../lib/kernel/index.js";
import {
  createFrontlineOutcomeRecord,
  FrontlineOutcomeRecordSchema,
  type FrontlineExecutableIdentity,
  type FrontlineOutcomeRecord,
} from "../core/advisory-records.js";
import { validateReviewTarget } from "../core/gate-contract-v2.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { BoundFrontlineResponseBinding } from "../core/frontline-response-binding.js";
import {
  FrontlineRunStateSchema,
  type FrontlineRunState,
} from "../core/operation-state-schema.js";
import type { ReviewPass } from "../core/review-pass.js";
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

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const GenerationSchema = z.number().int().nonnegative();
const TimestampSchema = z.iso.datetime({ offset: true });

export interface FrontlineRunBindingInput {
  target: ReviewTarget;
  source: FrontlineSourceDescriptor;
  responseBinding?: BoundFrontlineResponseBinding;
  generation: number;
  policyVersion: string;
}

interface FrontlineRunBinding {
  target: ReviewTarget;
  source: FrontlineSourceDescriptor;
  responseBinding?: BoundFrontlineResponseBinding;
  generation: number;
  policyVersion: string;
  operationId: string;
  sourceBindingId: string;
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
  const target = validateReviewTarget(input.target);
  const source = FrontlineSourceDescriptorSchema.parse(input.source);
  const generation = GenerationSchema.parse(input.generation);
  const policyVersion = CanonicalDigestSchema.parse(input.policyVersion);
  const operationId = canonicalDigest({
    domain: "arc.review-gate.frontline-operation/v1",
    targetId: target.targetId,
    sourceIdentity: source.sourceId,
    generation,
  });
  const sourceBindingId = computeFrontlineSourceBindingId(source, input.responseBinding);
  return {
    target,
    source,
    ...(input.responseBinding === undefined ? {} : { responseBinding: input.responseBinding }),
    generation,
    policyVersion,
    operationId,
    sourceBindingId,
  };
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
    || current.state.targetId !== binding.target.targetId
    || current.state.sourceIdentity !== binding.source.sourceId
    || current.state.generation !== binding.generation
  ) {
    return { action: "blocked", operationId: binding.operationId, reason: "operation-identity-conflict" };
  }
  const invalidatedBy: Array<"policy" | "source-binding"> = [];
  if (current.state.policyVersion !== binding.policyVersion) invalidatedBy.push("policy");
  if (current.state.sourceBindingId !== binding.sourceBindingId) invalidatedBy.push("source-binding");
  if (invalidatedBy.length > 0) {
    return {
      action: "execute",
      operationId: binding.operationId,
      expectedVersion: current.version,
      invalidatedBy,
    };
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
  passCount: number,
): FrontlineRunState {
  return FrontlineRunStateSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    operationId: binding.operationId,
    updatedAt: TimestampSchema.parse(updatedAt),
    kind: "frontline-run",
    targetId: binding.target.targetId,
    sourceIdentity: binding.source.sourceId,
    generation: binding.generation,
    outcome,
    passCount,
    policyVersion: binding.policyVersion,
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
  const state = createFrontlineRunState(binding, input.updatedAt, "pending", 0);
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
  const outcomeTarget = validateReviewTarget(outcome.target);
  if (
    canonicalize(outcomeTarget) !== canonicalize(binding.target)
    || canonicalize(outcome.source) !== canonicalize(binding.source)
  ) {
    throw new Error("frontline outcome does not match operation binding");
  }
  const state = createFrontlineRunState(binding, input.updatedAt, outcome.outcome, outcome.pass);
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
  pass: ReviewPass;
  maxPasses: ReviewPass;
  lockWaitMs: number;
}

/** Stable corruption failure for a completion claim without its exact durable outcome. */
export class FrontlineOperationCorruptStateError extends Error {
  readonly code = "corrupt-state" as const;

  constructor(message: string) {
    super(message);
    this.name = "FrontlineOperationCorruptStateError";
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

async function readBoundOutcome(
  store: FrontlineOutcomeStore,
  input: FrontlineRunExecutionInput,
  operationId: string,
  required: boolean,
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
  if (
    record.operationId !== operationId
    || record.repositoryId !== input.target.repositoryId
    || record.sourceIdentity !== input.source.sourceId
    || canonicalize(record.outcome.target) !== canonicalize(input.target)
    || canonicalize(record.outcome.source) !== canonicalize(input.source)
    || record.outcome.pass !== input.pass
    || record.outcome.maxPasses !== input.maxPasses
    || canonicalize(record.responseBinding ?? null) !== canonicalize(input.responseBinding ?? null)
  ) {
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

function admitsFreshGeneration(outcome: FrontlineExecutionOutcome): boolean {
  return outcome.outcome === "timed-out"
    || outcome.outcome === "unavailable"
    || outcome.outcome === "failed";
}

async function executeAndPersistFrontlineRun(
  dependencies: FrontlineRunExecutionDependencies,
  input: FrontlineRunExecutionInput,
  operationId: string,
  stateVersion: number,
  publishPending: boolean,
): Promise<FrontlineRunTerminal> {
  const expectedTerminalVersion = publishPending
    ? (await persistFrontlineRunPending(dependencies.operationStore, {
        ...input,
        updatedAt: dependencies.now(),
        expectedVersion: stateVersion,
      })).version
    : stateVersion;
  const executed = await dependencies.execute();
  const outcome = FrontlineExecutionOutcomeSchema.parse(executed.outcome);
  if (outcome.pass !== input.pass || outcome.maxPasses !== input.maxPasses) {
    throw new Error("frontline outcome does not match the authorized pass");
  }
  const record = createFrontlineOutcomeRecord({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: input.target.repositoryId,
    operationId,
    sourceIdentity: input.source.sourceId,
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
    target: input.target,
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
  for (let generation = input.generation; Number.isSafeInteger(generation); generation += 1) {
    const attempt = { ...input, generation };
    const operationId = bindFrontlineRun(attempt).operationId;
    const terminal = await dependencies.withOperationLock(operationId, input.lockWaitMs, async () => {
      for (let retry = 0; retry < REVIEW_VERSION_RETRY_ATTEMPTS; retry += 1) {
        try {
          const resolution = await resolveFrontlineRun(dependencies.operationStore, attempt);
          if (resolution.action === "blocked") {
            throw new FrontlineOperationCorruptStateError(
              `frontline operation '${resolution.operationId}' has a conflicting identity`,
            );
          }
          if (resolution.action === "execute") {
            if (resolution.invalidatedBy.length > 0) return null;
            return await executeAndPersistFrontlineRun(
              dependencies,
              attempt,
              resolution.operationId,
              resolution.expectedVersion,
              true,
            );
          }

          const persisted = await readBoundOutcome(
            dependencies.outcomeStore,
            attempt,
            resolution.operationId,
            resolution.state.outcome !== "pending",
          );
          if (resolution.state.outcome === "pending") {
            if (persisted === null) {
              return await executeAndPersistFrontlineRun(
                dependencies,
                attempt,
                resolution.operationId,
                resolution.version,
                false,
              );
            }
            const recovered = await persistFrontlineRunOutcome(dependencies.operationStore, {
              ...attempt,
              outcome: persisted.record.outcome,
              updatedAt: dependencies.now(),
              expectedVersion: resolution.version,
            });
            return terminalFromRecord(recovered.version, attempt.target, persisted);
          }
          if (persisted === null) {
            throw new FrontlineOperationCorruptStateError(
              `frontline operation '${resolution.operationId}' claims completion without an outcome`,
            );
          }
          if (
            resolution.state.outcome !== persisted.record.outcome.outcome
            || resolution.state.passCount !== persisted.record.outcome.pass
          ) {
            throw new FrontlineOperationCorruptStateError(
              `frontline operation '${resolution.operationId}' does not match its outcome`,
            );
          }
          if (admitsFreshGeneration(persisted.record.outcome)) return null;
          return terminalFromRecord(resolution.version, attempt.target, persisted);
        } catch (error) {
          if (!isReviewVersionConflict(error)) throw error;
        }
      }
      throw new Error(
        `frontline operation generation ${generation} exceeded version-conflict retry attempts`,
      );
    });
    if (terminal !== null) return terminal;
  }
  throw new Error("frontline operation generation exhausted");
}
