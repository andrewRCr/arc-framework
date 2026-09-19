/** Kernel registration for public review request schemas owned by their own command modules. */

import type { KernelRegistry } from "../../lib/kernel/index.js";
import { HostedAwaitEnvelopeSchema } from "./hosted/await.js";
import { HostedRequestEnvelopeSchema } from "./hosted/request.js";
import { ReviewPolicyCommandRequestSchema } from "./policy/review-policy-driver.js";
import { ReduceRequestSchema } from "./runtime/reduce-command.js";
import { RespondRequestSchema } from "./runtime/respond-command.js";

export const REVIEW_RESOLVE_REQUEST_SCHEMA_ID = "review-resolve-request";
export const REVIEW_HOSTED_AWAIT_REQUEST_SCHEMA_ID = "review-hosted-await-request";
export const REVIEW_REDUCE_REQUEST_SCHEMA_ID = "review-reduce-request";
export const REVIEW_RESPOND_REQUEST_SCHEMA_ID = "review-respond-request";
export const REVIEW_HOSTED_REQUEST_REQUEST_SCHEMA_ID = "review-hosted-request-request";

/**
 * Register the strict-current request contracts whose schemas live beside their commands.
 *
 * These roots are declared where the command validates them, so registration binds the existing
 * export rather than restating its shape — a second declaration would be free to drift from the
 * one the command actually parses.
 *
 * @param registry - Review-domain registry under composition.
 * @returns The same registry, for chained composition.
 */
export function registerReviewRequestCommandSchemas(registry: KernelRegistry): KernelRegistry {
  for (const [id, schema] of [
    [REVIEW_RESOLVE_REQUEST_SCHEMA_ID, ReviewPolicyCommandRequestSchema],
    [REVIEW_HOSTED_AWAIT_REQUEST_SCHEMA_ID, HostedAwaitEnvelopeSchema],
    [REVIEW_REDUCE_REQUEST_SCHEMA_ID, ReduceRequestSchema],
    [REVIEW_RESPOND_REQUEST_SCHEMA_ID, RespondRequestSchema],
    [REVIEW_HOSTED_REQUEST_REQUEST_SCHEMA_ID, HostedRequestEnvelopeSchema],
  ] as const) {
    registry.register(schema, { id, version: 1, migrationPosture: "strict-current" });
  }
  return registry;
}
