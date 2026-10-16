/** Fresh-admission continuation for an exact frontline retry refused over its old admission. */

import { spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import type { FrontlineAdmission } from "../core/frontline-admission.js";
import { FrontlineAdmissionError } from "../core/frontline-admission-error.js";
import { frontlineRetryCeilingOverride } from "../core/frontline-retry-contract.js";
import type { LaneProgressState } from "../core/operation-state-schema.js";
import { FrontlineRunRequestSchema } from "../core/frontline-run-command-schema.js";
import { FrontlineResolveRequestSchema } from "../policy/frontline-command-schema.js";
import { FrontlineOperationRetryError } from "../policy/frontline-operation.js";

/**
 * Compose safe resolver guidance without reusing admitted facts across different targets.
 * @param error - Execution refusal after durable admission validation
 * @param submittedRequest - Public run request exactly as submitted
 * @returns A resolver continuation for a stale admission, or no remedy for other failures
 */
export function frontlineRetryRemedy(error: unknown, submittedRequest: unknown): SpineRemedy | undefined {
  const unavailableAdmission = error instanceof FrontlineAdmissionError
    && (error.reason === "stale-target" || error.reason === "missing-admission");
  const staleRetry = error instanceof FrontlineOperationRetryError && error.reason === "stale-admission";
  if (!unavailableAdmission && !staleRetry) return undefined;
  const request = FrontlineRunRequestSchema.parse(submittedRequest);
  if (request.resolution.state !== "ready") return undefined;
  if (error instanceof FrontlineAdmissionError && error.reason === "stale-target") {
    return spineRemedy(
      "The ready response belongs to a different target; its routing facts cannot be reused.",
      "Read the resolver schema, classify the current target, and submit a fresh resolve request before running again",
      ["arc", "review", "frontline", "resolve", "--schema"],
    );
  }
  const admission = request.resolution.payload.admission;
  const source = admission.frontlineReview.source;
  if (source === null) return undefined;
  const resolverRequest = FrontlineResolveRequestSchema.parse({
    schemaVersion: 1,
    target: request.target,
    changeSet: admission.routing.facts,
    invocation: {
      mode: admission.frontlineReview.reasons.includes("invocation-force") ? "force" : "inherit",
      ...(admission.frontlineReview.reasons.includes("source-invocation") ? { sourceId: source.sourceId } : {}),
    },
    ...(!staleRetry || error.ceilingOverride === undefined
      ? {} : { policyJudgment: { ceilingOverride: error.ceilingOverride } }),
    ...(admission.lineage.kind === "delivery-member"
      ? { vehicle: { ...admission.lineage, head: request.target.headSha } } : {}),
  });
  return spineRemedy(
    unavailableAdmission
      ? "The submitted ready response no longer authorizes this target."
      : "A retry needs a fresh admission for the same exact target and logical pass.",
    "Re-resolve before using its returned ready resolution in arc review frontline run -"
      + (request.retryOfOperationId === undefined ? "." : ` with retryOfOperationId: '${request.retryOfOperationId}'`),
    ["arc", "review", "frontline", "resolve", "-"],
    resolverRequest,
  );
}

/**
 * Attach existing conditional authority only to a validated stale-admission refusal.
 * @param owner - The validated lane owner used to admit the run
 * @param admission - The exact stored admission
 * @param run - Durable execution and retry validation
 * @returns The normal run result; refusals retain their original classification
 */
export async function withFrontlineRetryAuthorization<T>(
  owner: LaneProgressState | null,
  admission: FrontlineAdmission,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FrontlineOperationRetryError && error.reason === "stale-admission") {
      throw new FrontlineOperationRetryError(error.message, error.reason, frontlineRetryCeilingOverride(owner, admission));
    }
    throw error;
  }
}
