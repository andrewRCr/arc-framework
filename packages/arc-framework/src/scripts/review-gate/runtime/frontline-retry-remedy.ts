/** Fresh-admission continuation for an exact frontline retry refused over its old admission. */

import { spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import { FrontlineRunRequestSchema } from "../core/frontline-run-command-schema.js";
import { FrontlineResolveRequestSchema } from "../policy/frontline-command-schema.js";
import { FrontlineOperationRetryError } from "../policy/frontline-operation.js";

/**
 * Compose the public resolver request from the refused run's exact admitted inputs.
 * @param error - Execution refusal after durable admission validation
 * @param submittedRequest - Public run request exactly as submitted
 * @returns A resolver continuation for a stale admission, or no remedy for other failures
 */
export function frontlineRetryRemedy(error: unknown, submittedRequest: unknown): SpineRemedy | undefined {
  if (!(error instanceof FrontlineOperationRetryError) || error.reason !== "stale-admission") return undefined;
  const request = FrontlineRunRequestSchema.parse(submittedRequest);
  if (request.resolution.state !== "ready") return undefined;
  const admission = request.resolution.payload.admission;
  const source = admission.frontlineReview.source;
  if (source === null) return undefined;
  const resolverRequest = FrontlineResolveRequestSchema.parse({
    schemaVersion: 1,
    target: request.target,
    changeSet: admission.routing.facts,
    invocation: { mode: "force", sourceId: source.sourceId },
    ...(admission.lineage.kind === "delivery-member"
      ? { vehicle: { ...admission.lineage, head: request.target.headSha } } : {}),
  });
  return spineRemedy(
    "A retry needs a fresh admission for the same exact target and logical pass.",
    "Re-resolve before using its returned ready resolution in arc review frontline run - "
      + `with retryOfOperationId: '${request.retryOfOperationId}'`,
    ["arc", "review", "frontline", "resolve", "-"],
    resolverRequest,
  );
}
