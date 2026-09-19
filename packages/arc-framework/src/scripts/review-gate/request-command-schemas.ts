/** Kernel registration for public review request schemas owned by their own command modules. */

import type { KernelRegistry } from "../../lib/kernel/index.js";
import { HostedAwaitEnvelopeSchema } from "./hosted/await.js";
import { ReviewPolicyCommandRequestSchema } from "./policy/review-policy-driver.js";
import { ReduceRequestSchema } from "./runtime/reduce-command.js";

export const REVIEW_RESOLVE_REQUEST_SCHEMA_ID = "review-resolve-request";
export const REVIEW_HOSTED_AWAIT_REQUEST_SCHEMA_ID = "review-hosted-await-request";
export const REVIEW_REDUCE_REQUEST_SCHEMA_ID = "review-reduce-request";

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
  ] as const) {
    registry.register(schema, { id, version: 1, migrationPosture: "strict-current" });
  }
  return registry;
}
