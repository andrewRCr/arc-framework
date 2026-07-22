/** Durable replay and invalidation policy for non-evidentiary frontline runs. */

import { z } from "zod";

import { canonicalDigest, canonicalize } from "../../../lib/kernel/index.js";
import { validateReviewTarget } from "../core/gate-contract-v2.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import {
  FrontlineRunStateSchema,
  type FrontlineRunState,
} from "../core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../core/ports.js";
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
  generation: number;
  policyVersion: string;
}

interface FrontlineRunBinding {
  target: ReviewTarget;
  source: FrontlineSourceDescriptor;
  generation: number;
  policyVersion: string;
  operationId: string;
  sourceBindingId: string;
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
  const sourceBindingId = canonicalDigest({
    domain: "arc.review-gate.frontline-source-binding/v1",
    source,
  });
  return { target, source, generation, policyVersion, operationId, sourceBindingId };
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
