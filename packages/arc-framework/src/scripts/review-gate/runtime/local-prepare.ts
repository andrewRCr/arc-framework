/** End-to-end orchestration for `arc review local prepare`. */

import { z } from "zod";

import type { LocalTargetConfirmation } from "../hosts/local/repository-target.js";
import type { LocalReviewPolicyBindingResolution } from "../policy/local-review-policy.js";
import type { LocalReviewGuidance } from "../policy/local-review-guidance.js";
import type { ReviewMethodActivity, ReviewAssuranceInput } from "../policy/assurance-schema.js";
import { resolveReviewRouting } from "../policy/routing.js";
import { projectStandardReviewObligation } from "../policy/standard-review-projection.js";
import { createReviewRequirement } from "../core/gate-contract-v2.js";
import {
  ReviewIdentifierSchema,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import {
  createLocalReviewAdmission,
  resolveLocalReviewAdmission,
} from "../core/local-operation.js";
import {
  createLocalReviewSourcePayload,
  publishLocalReviewPreparation,
  type LocalReviewPreparation,
} from "../core/local-prepare.js";
import {
  LocalPrepareEnvelopeSchema,
} from "../core/review-command-envelope.js";
import {
  LocalReviewSourceSchema,
  type LocalReviewSource,
} from "../core/local-review-source.js";
import type { LocalReviewAuthority } from "../core/local-review-authority.js";
import type {
  LocalReviewSourceStore,
  ReviewOperationStateStore,
} from "../core/ports.js";
import type { LocalReviewPolicyBinding } from "../policy/local-review-policy.js";

const DEFAULT_LOCAL_REVIEW_FRESHNESS_MS = 24 * 60 * 60 * 1_000;

export const LocalPrepareRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  evaluatorIdentity: ReviewIdentifierSchema,
  routingFacts: z.unknown(),
  freshnessMs: z.number().int().positive().optional(),
});
export type LocalPrepareRequest = z.infer<typeof LocalPrepareRequestSchema>;

type AssuranceComposition =
  | {
      status: "resolved";
      assurance: ReviewAssuranceInput;
      activity: ReviewMethodActivity;
      guidance: LocalReviewGuidance;
      diagnostics: readonly string[];
    }
  | { status: "refused"; diagnostics: readonly string[] };

export interface LocalPrepareDependencies {
  sweep(): Promise<void>;
  resolveRepositoryId(): Promise<string>;
  deriveTarget(repositoryId: string): Promise<ReviewTarget>;
  confirmTarget(target: ReviewTarget): Promise<LocalTargetConfirmation>;
  resolveAuthority(evaluatorIdentity: string): Promise<LocalReviewAuthority>;
  composeAssurance(authority: LocalReviewAuthority): Promise<AssuranceComposition>;
  resolvePolicy(): LocalReviewPolicyBindingResolution;
  validatePolicySelection(
    binding: LocalReviewPolicyBinding,
    authority: LocalReviewAuthority,
  ): void;
  operationStore: ReviewOperationStateStore;
  sourceStore: LocalReviewSourceStore;
  describeSource(operationId: string, target: ReviewTarget): Promise<LocalReviewSource>;
  materialize(source: LocalReviewSource): Promise<{ reviewRoot: string }>;
  now(): string;
}

function diagnostics(messages: readonly string[]) {
  return messages.map((message) => ({ code: "local-prepare", message }));
}

function routingRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

/** Derive, admit, publish, and prove one immutable local review operation. */
export async function prepareLocalReview(
  requestInput: unknown,
  dependencies: LocalPrepareDependencies,
): Promise<z.infer<typeof LocalPrepareEnvelopeSchema>> {
  const request = LocalPrepareRequestSchema.parse(requestInput);
  await dependencies.sweep();
  const repositoryId = await dependencies.resolveRepositoryId();
  const target = await dependencies.deriveTarget(repositoryId);
  const authority = await dependencies.resolveAuthority(request.evaluatorIdentity);
  const assurance = await dependencies.composeAssurance(authority);
  if (assurance.status === "refused") {
    return LocalPrepareEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: diagnostics(assurance.diagnostics),
      state: "unavailable",
      nextAction: "operator-repair",
      payload: {},
    });
  }
  const routing = resolveReviewRouting({
    schemaVersion: 1,
    ...routingRecord(request.routingFacts),
    changeSetState: "known",
    assurance: assurance.assurance,
    activity: assurance.activity,
  });
  const projection = projectStandardReviewObligation(routing.decision);
  const allDiagnostics = [...assurance.diagnostics, ...routing.diagnostics];
  if (projection.obligation === "exempt") {
    return LocalPrepareEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: diagnostics(allDiagnostics),
      state: "exempt",
      nextAction: "none",
      payload: {},
    });
  }
  const policy = dependencies.resolvePolicy();
  if (policy.status === "unavailable") {
    return LocalPrepareEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: diagnostics([...allDiagnostics, ...policy.diagnostics]),
      state: "unavailable",
      nextAction: "operator-repair",
      payload: {},
    });
  }
  dependencies.validatePolicySelection(policy.binding, authority);
  const requirement = createReviewRequirement({
    target,
    projection,
    acceptableSources: policy.binding.acceptableSources,
    initialAdmission: policy.binding.initialAdmission,
  });
  if (requirement === null) throw new Error("non-exempt local review produced no requirement");
  const admissionInput = {
    target,
    requirement,
    authority,
    policyBindingDigest: policy.binding.bindingDigest,
    requestMechanism: policy.binding.requestMechanism,
  };
  const confirmation = await dependencies.confirmTarget(target);
  if (confirmation.state === "stale-target") {
    return LocalPrepareEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: diagnostics(allDiagnostics),
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        attemptedTarget: confirmation.attemptedTarget,
        currentTarget: confirmation.currentTarget,
      },
    });
  }
  const existingVerification: {
    value?: { source: LocalReviewSource; reviewRoot: string };
  } = {};
  const resolution = await resolveLocalReviewAdmission(admissionInput, {
    store: dependencies.operationStore,
    verifyExisting: async (state) => {
      const source = await dependencies.sourceStore.readSource(state.sourceRef);
      if (source === null
        || source.sourceDigest !== state.sourceDigest
        || source.targetId !== state.targetId) {
        throw new Error("local review source reference mismatch");
      }
      const materialized = await dependencies.materialize(source);
      existingVerification.value = { source, reviewRoot: materialized.reviewRoot };
    },
  });
  let preparation: LocalReviewPreparation;
  if (resolution.state === "existing") {
    const verified = existingVerification.value;
    if (verified === undefined) throw new Error("existing local review was not verified");
    preparation = {
      persistedVersion: resolution.persistedVersion,
      state: resolution.persistedState,
      sourceRef: resolution.persistedState.sourceRef,
      sourceDigest: verified.source.sourceDigest,
      reviewRoot: verified.reviewRoot,
    };
  } else {
    const source = LocalReviewSourceSchema.parse(
      await dependencies.describeSource(resolution.operationId, target),
    );
    preparation = await publishLocalReviewPreparation(
      createLocalReviewAdmission(admissionInput),
      source,
      {
        sourceStore: dependencies.sourceStore,
        operationStore: dependencies.operationStore,
        materialize: (candidate) => dependencies.materialize(candidate),
        now: () => dependencies.now(),
        cleanupTtlMs: request.freshnessMs ?? DEFAULT_LOCAL_REVIEW_FRESHNESS_MS,
        guidanceDigest: assurance.guidance.guidanceDigest,
      },
    );
  }
  const sourcePayload = createLocalReviewSourcePayload(resolution, preparation);
  return LocalPrepareEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-local-prepare",
    diagnostics: diagnostics(allDiagnostics),
    state: "ready",
    nextAction: "launch-review",
    payload: {
      operationId: resolution.operationId,
      persistedVersion: preparation.persistedVersion,
      target,
      request: resolution.carrier.request,
      reviewerPayload: {
        schemaVersion: 1,
        ...sourcePayload,
        guidance: assurance.guidance.projection,
        guidanceDigest: assurance.guidance.guidanceDigest,
        reviewerInstructions: assurance.guidance.reviewerInstructions,
      },
      sourceRef: preparation.sourceRef,
      sourceDigest: preparation.sourceDigest,
    },
  });
}
