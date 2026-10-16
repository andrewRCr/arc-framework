/** Withdrawal of never-started frontline working state without changing review evidence or pass authority. */

import type { FrontlineAdmission } from "../core/frontline-admission.js";
import { FrontlineAdmissionError } from "../core/frontline-admission-error.js";
import { LaneProgressStateSchema, type LaneProgressState } from "../core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../core/ports.js";

/** Remove one unused reservation while its caller holds both the lane and exact operation locks. */
export async function withdrawUnrunFrontlineAdmission(
  store: ReviewOperationStateStore,
  owner: LaneProgressState,
  ownerVersion: number,
  admission: FrontlineAdmission,
  now: string,
): Promise<{ state: LaneProgressState; version: number } | null> {
  const operation = await store.readOperation(admission.operationId);
  if (operation.state !== null || operation.version !== 0) return null;
  const consumedAuthority = owner.attempts.some((attempt) =>
    attempt.conditionalPassAuthorizations?.authorizations.some((authorization) =>
      authorization.status === "consumed" && authorization.admissionId === admission.operationId));
  if (consumedAuthority) {
    throw new FrontlineAdmissionError("conditional-authority-consumed",
      `Frontline admission '${admission.operationId}' already consumed conditional pass authority. `
      + "It cannot be withdrawn or superseded by ordinary resolve. Re-resolve its retained target without skip "
      + "to recover the ready admission; cancellation of consumed authority requires a separate policy decision.");
  }
  const state = LaneProgressStateSchema.parse({
    ...owner,
    updatedAt: now,
    attempts: owner.attempts.filter(({ attemptId }) => attemptId !== admission.operationId),
  });
  const { version } = await store.publishOperation(state, ownerVersion);
  return { state, version };
}
