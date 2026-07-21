/** Harness-scheduled and explicit human fallbacks for suspended review re-entry. */

import { z } from "zod";

import {
  ReviewSuspensionStateSchema,
  type ReviewSuspensionState,
} from "../core/operation-state-schema.js";
import type { ReviewScheduledWakeupCapability } from "../core/ports.js";
import {
  ReviewReentryResultSchema,
  type ReviewReentryResult,
} from "../core/review-reentry-schema.js";
import { createReviewWakeupRequest } from "./review-wakeup-capability.js";

const TimestampSchema = z.iso.datetime({ offset: true });
const ScheduledWakeupSchema = z.strictObject({
  status: z.literal("scheduled"),
  wakeupRef: z.string().trim().min(1),
});

export interface HumanReviewReentry {
  kind: "human";
  reason: "scheduled-wakeup-unavailable" | "review-timed-out" | "provider-failed";
  resumeWhen: string;
  resumeHow: string;
}

export type ReviewWakeupFallback =
  | { kind: "scheduled"; scheduledFor: string; wakeupRef: string }
  | HumanReviewReentry;

function humanReentry(
  suspension: ReviewSuspensionState,
  reason: HumanReviewReentry["reason"],
): HumanReviewReentry {
  const vehicle = suspension.vehicle.kind === "work-unit" ? "work unit" : "errand";
  return {
    kind: "human",
    reason,
    resumeWhen: `Resume when ${suspension.sourceIdentity} changes review state, or by ${suspension.deadlineAt}.`,
    resumeHow: `Re-enter ARC integration for ${vehicle} '${suspension.vehicle.identity}' in repository '${suspension.repositoryId}'.`,
  };
}

/** Arm a bounded harness schedule, or make the human fallback explicit when scheduling is absent. */
export async function armReviewWakeupFallback(
  capability: ReviewScheduledWakeupCapability | null,
  suspensionInput: ReviewSuspensionState,
  scheduledForInput: string,
): Promise<ReviewWakeupFallback> {
  const suspension = ReviewSuspensionStateSchema.parse(suspensionInput);
  const scheduledFor = TimestampSchema.parse(scheduledForInput);
  if (capability === null) return humanReentry(suspension, "scheduled-wakeup-unavailable");
  if (Date.parse(scheduledFor) > Date.parse(suspension.deadlineAt)) {
    throw new Error("scheduled review wakeup exceeds suspension deadline");
  }
  const scheduled = ScheduledWakeupSchema.parse(await capability.schedule({
    ...createReviewWakeupRequest(suspension),
    scheduledFor,
  }));
  return { kind: "scheduled", scheduledFor, wakeupRef: scheduled.wakeupRef };
}

/** Convert terminal wait failures into the same explicit human re-entry shape. */
export function humanReentryForTerminalWait(
  resultInput: ReviewReentryResult,
  suspensionInput: ReviewSuspensionState,
): HumanReviewReentry {
  const result = ReviewReentryResultSchema.parse(resultInput);
  const suspension = ReviewSuspensionStateSchema.parse(suspensionInput);
  if (result.operationId !== suspension.operationId || result.targetId !== suspension.targetId) {
    throw new Error("terminal review result does not match its suspension");
  }
  if (result.state === "timed-out") return humanReentry(suspension, "review-timed-out");
  if (result.state === "provider-failed") return humanReentry(suspension, "provider-failed");
  throw new Error("review result does not require terminal human re-entry");
}
