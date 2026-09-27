/** Registry binding for public review command envelopes. */

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { ReviewReadinessEnvelopeSchema } from "../readiness.js";
import { ReviewResolveEnvelopeSchema } from "../policy/review-policy-driver.js";
import { PrePublicationReviewEnvelopeSchema } from "../policy/pre-publication-procedure.js";
import { HostedRequestResultSchema } from "../hosted/request.js";
import { HostedAwaitResultSchema } from "../hosted/await.js";
import { HostedSettleResultSchema } from "../hosted/settle.js";
import {
  FrontlineResolveEnvelopeSchema, ReviewChunkingResolveEnvelopeSchema,
  PlanningGroomingReviewEnvelopeSchema, FrontlineRunEnvelopeSchema,
  LocalPrepareEnvelopeSchema, LocalAttestEnvelopeSchema, RespondEnvelopeSchema,
  ReduceEnvelopeSchema, LocalResumeEnvelopeSchema, ReviewCommandErrorEnvelopeSchema,
} from "./review-command-envelope.js";

/** Register every command envelope as a strict-current protocol contract. */
export function registerReviewCommandEnvelopeSchemas(registry: KernelRegistry): KernelRegistry {
  for (const [id, schema] of [
    ["review-readiness-envelope", ReviewReadinessEnvelopeSchema],
    ["review-resolve-envelope", ReviewResolveEnvelopeSchema],
    ["review-frontline-resolve-envelope", FrontlineResolveEnvelopeSchema],
    ["review-chunking-resolve-envelope", ReviewChunkingResolveEnvelopeSchema],
    ["review-planning-grooming-resolve-envelope", PlanningGroomingReviewEnvelopeSchema],
    ["review-frontline-run-envelope", FrontlineRunEnvelopeSchema],
    ["review-local-prepare-envelope", LocalPrepareEnvelopeSchema],
    ["review-local-attest-envelope", LocalAttestEnvelopeSchema],
    ["review-respond-envelope", RespondEnvelopeSchema],
    ["review-reduce-envelope", ReduceEnvelopeSchema],
    ["review-local-resume-envelope", LocalResumeEnvelopeSchema],
    ["review-hosted-request-envelope", HostedRequestResultSchema],
    ["review-hosted-await-envelope", HostedAwaitResultSchema],
    ["review-hosted-settle-envelope", HostedSettleResultSchema],
    ["review-pre-publication-envelope", PrePublicationReviewEnvelopeSchema],
    ["review-command-error-envelope", ReviewCommandErrorEnvelopeSchema],
  ] as const) {
    registry.register(schema, { id, version: 1, migrationPosture: "strict-current" });
  }
  return registry;
}
