/** Kernel registration for public review support-command result schemas. */

import type { KernelRegistry } from "../../lib/kernel/index.js";
import { ChecksAwaitCommandResultSchema } from "./checks-await.js";
import { ChangeRequestResolveResultSchema } from "./change-request.js";
import { MergeMethodResolveResultSchema } from "./merge-method.js";
import { ReviewStatusCommandResultSchema } from "./status.js";

/** Register the public support-command results at their shared review-domain boundary. */
export function registerReviewSupportCommandSchemas(registry: KernelRegistry): KernelRegistry {
  for (const [id, schema] of [
    ["review-change-request-resolve-result", ChangeRequestResolveResultSchema],
    ["review-merge-method-resolve-result", MergeMethodResolveResultSchema],
    ["review-checks-await-result", ChecksAwaitCommandResultSchema],
    ["review-status-result", ReviewStatusCommandResultSchema],
  ] as const) {
    registry.register(schema, { id, version: 1, migrationPosture: "strict-current" });
  }
  return registry;
}
