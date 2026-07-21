/** Capability-only selection of the promoted watcher ahead of later fallback layers. */

import { z } from "zod";

import {
  ReviewSuspensionStateSchema,
  type ReviewSuspensionState,
} from "../core/operation-state-schema.js";
import type { ReviewWakeupCapability, ReviewWakeupRequest } from "../core/ports.js";

const ArmedWakeupSchema = z.strictObject({
  status: z.literal("armed"),
  wakeupRef: z.string().trim().min(1),
});

export type PreferredReviewWakeup =
  | { kind: "watcher"; wakeupRef: string }
  | { kind: "fallback"; reason: "promoted-watcher-unavailable" };

function wakeupRequest(suspension: ReviewSuspensionState): ReviewWakeupRequest {
  return {
    operationId: suspension.operationId,
    vehicle: suspension.vehicle,
    repositoryId: suspension.repositoryId,
    changeRequestId: suspension.changeRequestId,
    targetId: suspension.targetId,
    requestId: suspension.requestId,
    sourceIdentity: suspension.sourceIdentity,
    generation: suspension.generation,
    deadlineAt: suspension.deadlineAt,
    wakeupToken: suspension.wakeupToken,
  };
}

/** Arm the injected promoted watcher, or return the ordinary fallback without probing another runtime. */
export async function armPreferredReviewWakeup(
  capability: ReviewWakeupCapability | null,
  suspensionInput: ReviewSuspensionState,
): Promise<PreferredReviewWakeup> {
  const suspension = ReviewSuspensionStateSchema.parse(suspensionInput);
  if (capability === null) {
    return { kind: "fallback", reason: "promoted-watcher-unavailable" };
  }
  const armed = ArmedWakeupSchema.parse(await capability.arm(wakeupRequest(suspension)));
  return { kind: "watcher", wakeupRef: armed.wakeupRef };
}
