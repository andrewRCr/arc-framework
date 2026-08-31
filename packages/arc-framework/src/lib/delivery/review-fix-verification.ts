/** Shared installation and projection of one recoverable delivery review-fix verification continuation. */

import { canonicalDigest, canonicalize } from "../kernel/index.js";
import type { DeliveryRevisionedRecord } from "./ports.js";
import { DeliveryStateV1Schema, type DeliveryStateV1 } from "./schema.js";

/** Exact command input carried until one review-fix verification continuation is consumed. */
export interface DeliveryReviewFixVerificationAcknowledgementInput {
  readonly planId: string;
  readonly selectedDeliverableId: string;
  readonly memberDeliverableIds: readonly string[];
  readonly expectedStateRevision: number;
  readonly continuationDigest: string;
}

/** Provider-neutral verification work projected after a review-fix mutation settles. */
export interface DeliveryReviewFixVerificationContinuation {
  readonly selectedDeliverableId: string;
  readonly nextAction: "verify-review-fix";
  readonly verification: {
    readonly memberDeliverableIds: readonly string[];
    readonly tier1Required: true;
  };
  readonly acknowledgementInput: DeliveryReviewFixVerificationAcknowledgementInput;
}

/** Install one exact pending continuation without replacing a different outstanding correction. */
export function installDeliveryReviewFixVerification(input: {
  readonly state: DeliveryStateV1;
  readonly selectedDeliverableId: string;
  readonly memberDeliverableIds: readonly string[];
}): DeliveryStateV1 | null {
  const pending = {
    selectedDeliverableId: input.selectedDeliverableId,
    memberDeliverableIds: [...input.memberDeliverableIds],
  };
  if (input.state.pendingReviewFixVerification !== null
    && canonicalize(input.state.pendingReviewFixVerification) !== canonicalize(pending)) {
    return null;
  }
  const parsed = DeliveryStateV1Schema.safeParse({
    ...input.state,
    pendingReviewFixVerification: pending,
  });
  return parsed.success ? parsed.data : null;
}

/** Project the sole exact acknowledgment locator from one persisted pending continuation. */
export function projectDeliveryReviewFixVerificationContinuation(input: {
  readonly planId: string;
  readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
}): DeliveryReviewFixVerificationContinuation | null {
  const pending = input.state.value.pendingReviewFixVerification;
  if (input.state.value.planId !== input.planId || pending === null
    || !Number.isSafeInteger(input.state.revision) || input.state.revision <= 0) {
    return null;
  }
  return {
    selectedDeliverableId: pending.selectedDeliverableId,
    nextAction: "verify-review-fix",
    verification: {
      memberDeliverableIds: pending.memberDeliverableIds,
      tier1Required: true,
    },
    acknowledgementInput: {
      planId: input.planId,
      selectedDeliverableId: pending.selectedDeliverableId,
      memberDeliverableIds: pending.memberDeliverableIds,
      expectedStateRevision: input.state.revision,
      continuationDigest: canonicalDigest(input.state.value),
    },
  };
}
