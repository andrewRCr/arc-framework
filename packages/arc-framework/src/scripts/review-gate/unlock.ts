/**
 * Exact-head unlock preflight and repository-dispatch orchestration.
 *
 * @module
 */

import { z } from "zod";

import {
  LivePullRequestSchema,
  ReviewReadinessEnvelopeSchema,
  ReviewTargetSchema,
  ReviewTreeRootSchema,
  ReviewVehicleSchema,
  type ReviewReadinessEnvelope,
  type ReviewReadinessRequest,
} from "./readiness.js";

const CLEARANCE_WORKFLOW_PATH = ".github/workflows/arc-clearance.yml";
const CLEARANCE_EVENT_TYPE = "arc-clearance";

export const ReviewUnlockRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  treeRoot: ReviewTreeRootSchema,
  target: ReviewTargetSchema,
  vehicle: ReviewVehicleSchema,
}).readonly();
export type ReviewUnlockRequest = z.infer<typeof ReviewUnlockRequestSchema>;

export const ReviewUnlockDispatchPayloadSchema = z.strictObject({
  eventType: z.literal(CLEARANCE_EVENT_TYPE),
  repository: ReviewTargetSchema.shape.repository,
  pullRequest: ReviewTargetSchema.shape.pullRequest,
  headSha: ReviewTargetSchema.shape.headSha,
  vehicle: ReviewVehicleSchema,
}).readonly();
export type ReviewUnlockDispatchPayload = z.infer<typeof ReviewUnlockDispatchPayloadSchema>;

const ReviewUnlockPayloadShape = {
  repository: ReviewTargetSchema.shape.repository,
  pullRequest: ReviewTargetSchema.shape.pullRequest,
  headSha: ReviewTargetSchema.shape.headSha,
};

export const ReviewUnlockEnvelopeSchema = z.discriminatedUnion("state", [
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("review-unlock"),
    diagnostics: z.array(z.strictObject({
      code: z.string().min(1),
      message: z.string().min(1),
    })).readonly(),
    state: z.literal("dispatched"),
    nextAction: z.literal("await-clearance"),
    payload: z.strictObject(ReviewUnlockPayloadShape).readonly(),
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("review-unlock"),
    diagnostics: z.array(z.strictObject({
      code: z.string().min(1),
      message: z.string().min(1),
    })).readonly(),
    state: z.literal("no-unlock"),
    nextAction: z.literal("none"),
    payload: z.strictObject({
      ...ReviewUnlockPayloadShape,
      reason: z.literal("workflow-absent"),
    }).readonly(),
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("review-unlock"),
    diagnostics: z.array(z.strictObject({
      code: z.string().min(1),
      message: z.string().min(1),
    })).min(1).readonly(),
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    payload: z.strictObject({
      ...ReviewUnlockPayloadShape,
      reason: z.enum([
        "repository-unavailable",
        "repository-mismatch",
        "pull-request-unavailable",
        "pull-request-mismatch",
        "pull-request-closed",
        "stale-head",
        "workflow-unreadable",
        "workflow-ambiguous",
        "readiness-failed",
        "dispatch-failed",
      ]),
    }).readonly(),
  }),
]);
export type ReviewUnlockEnvelope = z.infer<typeof ReviewUnlockEnvelopeSchema>;

export type WorkflowInspection =
  | { state: "present" }
  | { state: "absent" }
  | { state: "unreadable" }
  | { state: "ambiguous" };

/** GitHub and readiness boundaries used by the unlock orchestrator. */
export interface ReviewUnlockPort {
  resolveRepository(): Promise<{ repository: string; defaultBranch: string }>;
  resolvePullRequest(repository: string, pullRequest: number): Promise<z.infer<typeof LivePullRequestSchema>>;
  inspectWorkflow(input: {
    repository: string;
    ref: string;
    path: typeof CLEARANCE_WORKFLOW_PATH;
  }): Promise<WorkflowInspection>;
  checkReadiness(request: ReviewReadinessRequest): Promise<ReviewReadinessEnvelope>;
  dispatch(payload: ReviewUnlockDispatchPayload): Promise<void>;
}

function envelopeBase(request: ReviewUnlockRequest) {
  return {
    schemaVersion: 1 as const,
    mode: "review-unlock" as const,
    payload: {
      repository: request.target.repository,
      pullRequest: request.target.pullRequest,
      headSha: request.target.headSha,
    },
  };
}

function blocked(
  request: ReviewUnlockRequest,
  reason: Extract<ReviewUnlockEnvelope, { state: "blocked" }>["payload"]["reason"],
  message: string,
): ReviewUnlockEnvelope {
  return ReviewUnlockEnvelopeSchema.parse({
    ...envelopeBase(request),
    diagnostics: [{ code: reason, message }],
    state: "blocked",
    nextAction: "stop",
    payload: { ...envelopeBase(request).payload, reason },
  });
}

/**
 * Preflight and dispatch one exact-head ARC clearance request.
 *
 * @param input - Guarded target, supplied candidate tree, and vehicle.
 * @param port - Authenticated repository, PR, workflow, readiness, and dispatch boundary.
 * @returns A strict dispatched, no-unlock, or blocked envelope.
 */
export async function unlockReviewHead(
  input: ReviewUnlockRequest,
  port: ReviewUnlockPort,
): Promise<ReviewUnlockEnvelope> {
  const request = ReviewUnlockRequestSchema.parse(input);
  let repository: { repository: string; defaultBranch: string };
  try {
    repository = await port.resolveRepository();
  } catch {
    return blocked(request, "repository-unavailable", "The authenticated repository could not be resolved.");
  }
  if (
    repository.repository.toLowerCase() !== request.target.repository.toLowerCase()
    || repository.defaultBranch.trim() === ""
  ) {
    return blocked(request, "repository-mismatch", "The authenticated repository does not match the unlock target.");
  }

  let pullRequest: z.infer<typeof LivePullRequestSchema>;
  try {
    pullRequest = LivePullRequestSchema.parse(
      await port.resolvePullRequest(request.target.repository, request.target.pullRequest),
    );
  } catch {
    return blocked(request, "pull-request-unavailable", "The guarded pull request could not be resolved.");
  }
  if (pullRequest.state !== "open") {
    return blocked(request, "pull-request-closed", "The guarded pull request is not open.");
  }
  if (
    pullRequest.repository.toLowerCase() !== request.target.repository.toLowerCase()
    || pullRequest.number !== request.target.pullRequest
  ) {
    return blocked(request, "pull-request-mismatch", "The resolved pull request does not match the unlock target.");
  }
  if (pullRequest.headSha !== request.target.headSha) {
    return blocked(request, "stale-head", "The requested SHA is not the exact live pull-request head.");
  }

  let workflow: WorkflowInspection;
  try {
    workflow = await port.inspectWorkflow({
      repository: request.target.repository,
      ref: repository.defaultBranch,
      path: CLEARANCE_WORKFLOW_PATH,
    });
  } catch {
    return blocked(request, "workflow-unreadable", "The default-branch clearance workflow lookup failed.");
  }
  if (workflow.state === "absent") {
    return ReviewUnlockEnvelopeSchema.parse({
      ...envelopeBase(request),
      diagnostics: [],
      state: "no-unlock",
      nextAction: "none",
      payload: { ...envelopeBase(request).payload, reason: "workflow-absent" },
    });
  }
  if (workflow.state !== "present") {
    return blocked(
      request,
      workflow.state === "ambiguous" ? "workflow-ambiguous" : "workflow-unreadable",
      "The default-branch clearance workflow lookup was not determinate.",
    );
  }

  let readiness: ReviewReadinessEnvelope;
  try {
    readiness = ReviewReadinessEnvelopeSchema.parse(await port.checkReadiness({
      schemaVersion: 1,
      treeRoot: request.treeRoot,
      target: request.target,
      pullRequest,
      vehicle: request.vehicle,
    }));
  } catch {
    return blocked(request, "readiness-failed", "The lifecycle-readiness result was unavailable or malformed.");
  }
  if (readiness.state !== "ready") {
    return blocked(request, "readiness-failed", "The exact candidate is not lifecycle-ready.");
  }

  const payload = ReviewUnlockDispatchPayloadSchema.parse({
    eventType: CLEARANCE_EVENT_TYPE,
    repository: request.target.repository,
    pullRequest: request.target.pullRequest,
    headSha: request.target.headSha,
    vehicle: request.vehicle,
  });
  try {
    await port.dispatch(payload);
  } catch {
    return blocked(request, "dispatch-failed", "The clearance repository dispatch failed.");
  }
  return ReviewUnlockEnvelopeSchema.parse({
    ...envelopeBase(request),
    diagnostics: [],
    state: "dispatched",
    nextAction: "await-clearance",
  });
}
