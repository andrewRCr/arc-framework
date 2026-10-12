/** Existing admission and authorization bindings for retries of one frontline pass. */

import { canonicalize } from "../../../lib/kernel/index.js";
import type { FrontlineAdmission } from "./frontline-admission.js";
import type { ConditionalPassAuthorization, LaneProgressState } from "./operation-state-schema.js";

export type FrontlineRetryCeilingOverride = Pick<ConditionalPassAuthorization, "exhaustedPassCount" | "nextPass"> & {
  conditionalPassAuthorizationId: ConditionalPassAuthorization["authorizationId"];
};

/**
 * Project the exact retry contract, excluding only the new operation and generation.
 * @param admission - Existing immutable source admission
 * @returns Target, source, policy, lineage, pass and coverage bindings
 */
export function frontlineRetryContract(admission: FrontlineAdmission): unknown {
  return {
    target: admission.target, lineage: admission.lineage, policyVersion: admission.policyVersion,
    logicalPass: admission.logicalPass, maxPasses: admission.maxPasses, requestedCoverage: admission.requestedCoverage,
  };
}

/**
 * Recover an existing consumed grant bound to this admission's original retry contract.
 * @param owner - The validated frontline lane owner
 * @param admission - The refused immutable admission
 * @returns The original ceiling override, or undefined when no unique matching grant exists
 */
export function frontlineRetryCeilingOverride(
  owner: LaneProgressState | null,
  admission: FrontlineAdmission,
): FrontlineRetryCeilingOverride | undefined {
  if (owner === null || owner.lane !== "frontline" || owner.repositoryId !== admission.target.repositoryId) return undefined;
  const matches = owner.attempts.flatMap((attempt) => attempt.conditionalPassAuthorizations?.authorizations ?? [])
    .filter((authorization) => {
      if (authorization.status !== "consumed" || authorization.lane !== "frontline"
        || authorization.repositoryId !== admission.target.repositoryId
        || canonicalize(authorization.lineage) !== canonicalize(admission.lineage)
        || authorization.nextPass !== admission.logicalPass
        || authorization.producedHeadSha !== admission.target.headSha) return false;
      const original = owner.attempts.find((attempt) => attempt.attemptId === authorization.admissionId);
      const bound = original?.frontline?.admission;
      return bound !== undefined && !original?.terminalProducer
        && bound.retryGeneration <= admission.retryGeneration
        && canonicalize(frontlineRetryContract(bound)) === canonicalize(frontlineRetryContract(admission));
    });
  const authorization = matches.length === 1 ? matches[0] : undefined;
  return authorization === undefined ? undefined : {
    exhaustedPassCount: authorization.exhaustedPassCount, nextPass: authorization.nextPass,
    conditionalPassAuthorizationId: authorization.authorizationId,
  };
}
