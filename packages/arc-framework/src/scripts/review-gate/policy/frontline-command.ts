/** Workflow-facing composition API for frontline semantic resolution. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import {
  FrontlineResolveEnvelopeSchema,
} from "../core/review-command-envelope.js";
import {
  createFrontlineAdmission,
  type FrontlineAdmission,
} from "../core/frontline-admission.js";
import { ReviewTargetSchema, type ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import { ReviewTargetCoordinatesSchema } from "../core/review-target-coordinates.js";
import type { ReviewOperationStateStore } from "../core/ports.js";
import { ReviewPassSchema, type ReviewPass } from "../core/review-pass.js";
import {
  consumeConditionalNextPassAuthorization,
  laneContinuationOperationId,
  readLaneProgressOwner,
  recordLaneAttempt,
} from "../lane-progress.js";
import { FrontlineInvocationOverrideSchema } from "./frontline-resolution.js";
import { resolveFrontlineReview, type FrontlineSemanticRecord } from "./frontline-semantic.js";
import type {
  FrontlineSourcePreferenceReader,
  FrontlineSourceRegistry,
} from "./frontline-source.js";
import { ReviewLaneJudgmentSchema } from "./review-policy-driver.js";
import { resolveReviewRouting, type ReviewRoutingResolution } from "./routing.js";

const FrontlinePolicyJudgmentSchema = ReviewLaneJudgmentSchema.unwrap()
  .pick({ ceilingOverride: true })
  .readonly();

const FrontlineRequestFields = {
  schemaVersion: z.literal(1),
  changeSet: z.unknown(),
  invocation: FrontlineInvocationOverrideSchema,
  policyJudgment: FrontlinePolicyJudgmentSchema.optional(),
  vehicle: DeliveryReviewMemberVehicleSchema.optional(),
} as const;

function validateFrontlineRequestVehicle(
  request: { target: { kind: string }; vehicle?: { kind: "delivery-member" } },
  context: z.RefinementCtx,
): void {
  if ((request.target.kind === "delivery-member") !== (request.vehicle !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["vehicle"],
      message: "frontline delivery targets require one exact member vehicle",
    });
  }
}

/** Public frontline resolve request composed only from caller-held facts. */
export const FrontlineResolveRequestSchema = z.strictObject({
  ...FrontlineRequestFields,
  target: ReviewTargetCoordinatesSchema,
}).superRefine(validateFrontlineRequestVehicle);
export type FrontlineResolveRequest = z.infer<typeof FrontlineResolveRequestSchema>;

/** Trusted frontline resolve request after repository-local target derivation. */
export const FrontlineCommandRequestSchema = z.strictObject({
  ...FrontlineRequestFields,
  target: ReviewTargetSchema,
}).superRefine(validateFrontlineRequestVehicle);
export type FrontlineCommandRequest = z.infer<typeof FrontlineCommandRequestSchema>;

export interface FrontlineCommandResult {
  schemaVersion: 1;
  mode: "review-frontline-resolve";
  diagnostics: Array<{ code: string; message: string }>;
  payload: {
    routing: Pick<ReviewRoutingResolution, "facts" | "decision">;
    frontlineReview: FrontlineSemanticRecord;
    pass?: ReviewPass;
    maxPasses?: ReviewPass;
    admission?: FrontlineAdmission;
  };
  state: "skipped" | "offered" | "ready";
  nextAction: "none" | "bind-source" | "obtain-authorization" | "run-frontline";
}

interface FrontlineCommandDependencies {
  preferences: FrontlineSourcePreferenceReader;
  registry: FrontlineSourceRegistry;
  operationStore: ReviewOperationStateStore;
  resolveLineage(
    target: ReviewTarget,
    vehicle: FrontlineCommandRequest["vehicle"],
  ): Promise<LaneSubjectLineage>;
  withLaneOperationLock<T>(operationId: string, action: () => Promise<T>): Promise<T>;
  confirmDispositionSetCurrent: (
    producerId: string,
    dispositionSetId: string,
  ) => Promise<boolean>;
  readMaxPasses(): Promise<number>;
  now(): string;
}

/**
 * Resolve explicit change-set facts and one-run intent without preparing or invoking a carrier.
 *
 * @param request - Versioned workflow request containing change-set facts and invocation intent.
 * @param dependencies - Preference and closed-registry ports owned by the caller's composition root.
 * @returns A machine-readable routing and frontline semantic result.
 */
export async function resolveFrontlineCommand(
  request: unknown,
  dependencies: FrontlineCommandDependencies,
): Promise<FrontlineCommandResult> {
  const parsed = FrontlineCommandRequestSchema.parse(request);
  const lineage = await dependencies.resolveLineage(parsed.target, parsed.vehicle);
  return dependencies.withLaneOperationLock(laneContinuationOperationId({
    lane: "frontline",
    repositoryId: parsed.target.repositoryId,
    headSha: parsed.target.headSha,
    lineage,
  }), () => resolveFrontlineCommandWithinLock(parsed, lineage, dependencies));
}

async function resolveFrontlineCommandWithinLock(
  parsed: FrontlineCommandRequest,
  lineage: LaneSubjectLineage,
  dependencies: FrontlineCommandDependencies,
): Promise<FrontlineCommandResult> {
  let owner = await readLaneProgressOwner(dependencies.operationStore, {
    lane: "frontline",
    repositoryId: parsed.target.repositoryId,
    headSha: parsed.target.headSha,
    lineage,
  });
  const pending = owner?.attempts.filter((attempt) => (
    attempt.outcome === "pending" && attempt.frontline !== undefined
  )) ?? [];
  if (pending.length > 1) throw new Error("frontline lineage has competing pending admissions");
  const pendingAdmission = pending[0]?.frontline?.admission;
  if (pendingAdmission !== undefined) {
    const conditionalPassAuthorizationId = parsed.policyJudgment?.ceilingOverride
      ?.conditionalPassAuthorizationId;
    if (conditionalPassAuthorizationId !== undefined) {
      await consumeConditionalNextPassAuthorization(dependencies.operationStore, {
        authorizationId: conditionalPassAuthorizationId,
        repositoryId: parsed.target.repositoryId,
        lane: "frontline",
        lineage,
        producedHeadSha: parsed.target.headSha,
        nextPass: pendingAdmission.logicalPass,
        admissionId: pendingAdmission.operationId,
        now: dependencies.now(),
      }, (producerId, dispositionSetId) => dependencies.confirmDispositionSetCurrent(
        producerId,
        dispositionSetId,
      ));
    }
    return FrontlineResolveEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-frontline-resolve",
      diagnostics: [],
      state: "ready",
      nextAction: "run-frontline",
      payload: {
        routing: pendingAdmission.routing,
        frontlineReview: pendingAdmission.frontlineReview,
        pass: pendingAdmission.logicalPass,
        maxPasses: pendingAdmission.maxPasses,
        admission: pendingAdmission,
      },
    });
  }
  const routing = resolveReviewRouting(parsed.changeSet);
  const configuredMaxPasses = ReviewPassSchema.parse(await dependencies.readMaxPasses());
  const conditionalCeiling = parsed.policyJudgment?.ceilingOverride;
  const maxPasses = conditionalCeiling?.conditionalPassAuthorizationId === undefined
    ? configuredMaxPasses
    : ReviewPassSchema.parse(Math.max(configuredMaxPasses, conditionalCeiling.nextPass));
  const semantic = await resolveFrontlineReview({
    methodActive: routing.facts.activity.frontlineReview,
    routerAction: routing.decision.frontlineAction,
    routerReasons: routing.decision.reasons,
    invocation: parsed.invocation,
    preferences: dependencies.preferences,
    registry: dependencies.registry,
    maxPasses,
  });
  const payload = {
    routing: { facts: routing.facts, decision: routing.decision },
    frontlineReview: semantic.frontlineReview,
  };
  const diagnostics = [
    ...routing.diagnostics.map((path) => ({
      code: "routing-input-rejected",
      message: `Rejected or missing routing input: ${path}`,
    })),
    ...semantic.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.sourceId === undefined
        ? `${diagnostic.tier} frontline source preference could not be applied`
        : `${diagnostic.tier} frontline source '${diagnostic.sourceId}' could not be applied`,
    })),
  ];
  const base = {
    schemaVersion: 1,
    mode: "review-frontline-resolve",
    diagnostics,
  };
  if (semantic.frontlineReview.action === "skip") {
    return FrontlineResolveEnvelopeSchema.parse({
      ...base,
      state: "skipped",
      nextAction: "none",
      payload,
    });
  }
  if (semantic.frontlineReview.action === "offer") {
    return FrontlineResolveEnvelopeSchema.parse({
      ...base,
      state: "offered",
      nextAction: semantic.frontlineReview.source === null ? "bind-source" : "obtain-authorization",
      payload,
    });
  }
  const logicalPass = ReviewPassSchema.parse((owner?.completedPasses ?? 0) + 1);
  if (logicalPass > maxPasses) {
    throw new Error("frontline pass allowance is exhausted");
  }
  const admittedSource = semantic.frontlineReview.source;
  if (admittedSource === null) throw new Error("frontline ready resolution lacks an executable source");
  const retryGeneration = (owner?.attempts
    .filter((attempt) => attempt.logicalPass === logicalPass)
    .reduce((maximum, attempt) => Math.max(maximum, attempt.retryGeneration), -1) ?? -1) + 1;
  const admission = createFrontlineAdmission({
    lineage,
    target: parsed.target,
    routing: payload.routing,
    frontlineReview: semantic.frontlineReview,
    logicalPass,
    retryGeneration,
    maxPasses,
  });
  try {
    const conditionalPassAuthorizationId = conditionalCeiling?.conditionalPassAuthorizationId;
    if (conditionalPassAuthorizationId !== undefined) {
      await consumeConditionalNextPassAuthorization(dependencies.operationStore, {
        authorizationId: conditionalPassAuthorizationId,
        repositoryId: parsed.target.repositoryId,
        lane: "frontline",
        lineage,
        producedHeadSha: parsed.target.headSha,
        nextPass: logicalPass,
        admissionId: admission.operationId,
        now: dependencies.now(),
      }, (producerId, dispositionSetId) => dependencies.confirmDispositionSetCurrent(
        producerId,
        dispositionSetId,
      ));
    }
    await recordLaneAttempt(dependencies.operationStore, {
      lane: "frontline",
      repositoryId: parsed.target.repositoryId,
      changeRequestId: null,
      headSha: parsed.target.headSha,
      lineage,
      logicalPass,
      retryGeneration,
      attemptId: admission.operationId,
      sourceId: admittedSource.sourceId,
      outcome: "pending",
      consumedPass: false,
      frontline: { admission, effectiveCoverage: null },
      now: dependencies.now(),
    });
  } catch (error) {
    owner = await readLaneProgressOwner(dependencies.operationStore, {
      lane: "frontline",
      repositoryId: parsed.target.repositoryId,
      headSha: parsed.target.headSha,
      lineage,
    });
    const concurrent = owner?.attempts.filter((attempt) => (
      attempt.outcome === "pending" && attempt.frontline !== undefined
    )) ?? [];
    const concurrentAdmission = concurrent.length === 1 ? concurrent[0]?.frontline?.admission : undefined;
    if (concurrentAdmission === undefined) throw error;
    return FrontlineResolveEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-frontline-resolve",
      diagnostics: [],
      state: "ready",
      nextAction: "run-frontline",
      payload: {
        routing: concurrentAdmission.routing,
        frontlineReview: concurrentAdmission.frontlineReview,
        pass: concurrentAdmission.logicalPass,
        maxPasses: concurrentAdmission.maxPasses,
        admission: concurrentAdmission,
      },
    });
  }
  return FrontlineResolveEnvelopeSchema.parse({
    ...base,
    state: "ready",
    nextAction: "run-frontline",
    payload: {
      ...payload,
      pass: logicalPass,
      maxPasses,
      admission,
    },
  });
}
