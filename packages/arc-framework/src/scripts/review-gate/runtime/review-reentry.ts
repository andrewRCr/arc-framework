/** Live reconstruction of review state from a durable, non-evidentiary suspension. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";
import { validateReviewTarget } from "../core/gate-contract-v2.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import {
  ReviewSuspensionStateSchema,
  type ReviewSuspensionState,
} from "../core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../core/ports.js";
import {
  ReviewReentryResultSchema,
  type ReviewReentryResult,
} from "../core/review-reentry-schema.js";
import { projectReviewResponse } from "../core/response-plan.js";

const TimestampSchema = z.iso.datetime({ offset: true });
const ReviewStateSchema = z.enum(["pending", "clean", "findings", "failed", "unavailable"]);

export interface ReviewReentryObservation {
  currentTarget: ReviewTarget;
  reviewState: z.infer<typeof ReviewStateSchema>;
  responseInput: unknown;
}

export interface ReviewReentryObserver {
  observe(suspension: ReviewSuspensionState): Promise<ReviewReentryObservation>;
}

function result(
  suspension: ReviewSuspensionState,
  persistedVersion: number,
  targetId: string,
  fields: Pick<ReviewReentryResult, "state" | "responsePlan" | "resumeText">,
): ReviewReentryResult {
  return ReviewReentryResultSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-reentry/v1",
    operationId: suspension.operationId,
    persistedVersion,
    targetId,
    ...fields,
  });
}

/** Re-read canonical host facts and derive one resume action without persisting conclusions or prose. */
export async function resolveReviewReentry(
  store: ReviewOperationStateStore,
  input: { suspension: ReviewSuspensionState; observedAt: string },
  dependencies: ReviewReentryObserver,
): Promise<ReviewReentryResult> {
  const suspension = ReviewSuspensionStateSchema.parse(input.suspension);
  const observedAt = TimestampSchema.parse(input.observedAt);
  const current = await store.readOperation(suspension.operationId);
  let persistedVersion = current.version;
  if (current.state === null) {
    persistedVersion = (await store.publishOperation(suspension, 0)).version;
  } else if (current.state.kind !== "review-suspension"
    || canonicalize(current.state) !== canonicalize(suspension)) {
    return result(suspension, current.version, suspension.targetId, {
      state: "operation-conflict",
      responsePlan: null,
      resumeText: "The durable suspension conflicts with the requested operation; operator repair is required.",
    });
  }

  const observed = await dependencies.observe(suspension);
  const currentTarget = validateReviewTarget(observed.currentTarget);
  const reviewState = ReviewStateSchema.parse(observed.reviewState);
  if (currentTarget.targetId !== suspension.targetId) {
    return result(suspension, persistedVersion, currentTarget.targetId, {
      state: "stale-target",
      responsePlan: null,
      resumeText: "The review target changed; recompute routing and request state from the current head.",
    });
  }
  if (reviewState === "clean") {
    return result(suspension, persistedVersion, currentTarget.targetId, {
      state: "review-complete",
      responsePlan: null,
      resumeText: "Review completed cleanly for the current exact target.",
    });
  }
  if (reviewState === "findings") {
    if (observed.responseInput === null) {
      return result(suspension, persistedVersion, currentTarget.targetId, {
        state: "provider-failed",
        responsePlan: null,
        resumeText: "The finding result lacked a valid live response projection; operator re-entry is required.",
      });
    }
    return result(suspension, persistedVersion, currentTarget.targetId, {
      state: "respond-to-findings",
      responsePlan: projectReviewResponse(observed.responseInput),
      resumeText: "Review findings require the freshly derived review-response action.",
    });
  }
  if (reviewState === "failed" || reviewState === "unavailable") {
    return result(suspension, persistedVersion, currentTarget.targetId, {
      state: "provider-failed",
      responsePlan: null,
      resumeText: "Review provider state is failed or unavailable; operator re-entry is required.",
    });
  }
  if (Date.parse(observedAt) >= Date.parse(suspension.deadlineAt)) {
    return result(suspension, persistedVersion, currentTarget.targetId, {
      state: "timed-out",
      responsePlan: null,
      resumeText: "Review wait reached its deadline; human re-entry is required.",
    });
  }
  return result(suspension, persistedVersion, currentTarget.targetId, {
    state: "suspended",
    responsePlan: null,
    resumeText: "Review remains pending; preserve Integrating state and re-enter by the declared deadline.",
  });
}
