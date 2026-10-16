/** Withdrawal of never-started frontline working state without changing review evidence or pass authority. */

import { AdvisoryLockTimeoutError } from "../../../lib/advisory-lock.js";
import type { FrontlineAdmission } from "../core/frontline-admission.js";
import { FrontlineAdmissionError } from "../core/frontline-admission-error.js";
import { LaneProgressStateSchema, type LaneProgressState } from "../core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../core/ports.js";

/** Preserve started runs without waiting for their lock; serialize withdrawal under the caller's lane lock. */
export async function withdrawUnrunFrontlineAdmission(
  store: ReviewOperationStateStore,
  owner: LaneProgressState,
  ownerVersion: number,
  admission: FrontlineAdmission,
  now: string,
  withOperationLock: <T>(operationId: string, action: () => Promise<T>) => Promise<T>,
): Promise<{ state: LaneProgressState; version: number } | null> {
  if (await admissionHasStarted(store, admission)) return null;
  try {
    return await withOperationLock(admission.operationId, () =>
      withdrawLockedAdmission(store, owner, ownerVersion, admission, now));
  } catch (error) {
    if (error instanceof AdvisoryLockTimeoutError && error.phase === "acquire"
      && await admissionHasStarted(store, admission)) return null;
    throw error;
  }
}

async function admissionHasStarted(store: ReviewOperationStateStore, admission: FrontlineAdmission): Promise<boolean> {
  const operation = await store.readOperation(admission.operationId);
  return operation.state !== null || operation.version !== 0;
}

async function withdrawLockedAdmission(
  store: ReviewOperationStateStore,
  owner: LaneProgressState,
  ownerVersion: number,
  admission: FrontlineAdmission,
  now: string,
): Promise<{ state: LaneProgressState; version: number } | null> {
  if (await admissionHasStarted(store, admission)) return null;
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
