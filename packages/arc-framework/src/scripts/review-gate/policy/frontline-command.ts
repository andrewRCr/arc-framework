/** Workflow-facing composition API for frontline semantic resolution. */

import { z } from "zod";

import { FrontlineInvocationOverrideSchema } from "./frontline-resolution.js";
import { resolveFrontlineReview, type FrontlineSemanticRecord } from "./frontline-semantic.js";
import type {
  FrontlineSourceDiagnostic,
  FrontlineSourcePreferenceReader,
  FrontlineSourceRegistry,
} from "./frontline-source.js";
import { resolveReviewRouting, type ReviewRoutingResolution } from "./routing.js";

export const FrontlineCommandRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  changeSet: z.unknown(),
  invocation: FrontlineInvocationOverrideSchema,
  maxPasses: z.union([z.literal(1), z.literal(2)]).optional(),
});
export type FrontlineCommandRequest = z.infer<typeof FrontlineCommandRequestSchema>;

export interface FrontlineCommandResult {
  schemaVersion: 1;
  mode: "review-frontline-resolve";
  routing: Pick<ReviewRoutingResolution, "facts" | "decision">;
  frontlineReview: FrontlineSemanticRecord;
  diagnostics: {
    routing: readonly string[];
    source: FrontlineSourceDiagnostic[];
  };
}

/**
 * Resolve explicit change-set facts and one-run intent without preparing or invoking a carrier.
 *
 * @param request - Versioned workflow request containing change-set facts and invocation intent.
 * @param dependencies - Preference and closed-registry ports owned by the caller's composition root.
 * @returns A machine-readable routing and frontline semantic result.
 */
export async function resolveFrontlineCommand(
  request: unknown,
  dependencies: {
    preferences: FrontlineSourcePreferenceReader;
    registry: FrontlineSourceRegistry;
  },
): Promise<FrontlineCommandResult> {
  const parsed = FrontlineCommandRequestSchema.parse(request);
  const routing = resolveReviewRouting(parsed.changeSet);
  const semantic = await resolveFrontlineReview({
    methodActive: routing.facts.activity.frontlineReview,
    routerAction: routing.decision.frontlineAction,
    routerReasons: routing.decision.reasons,
    invocation: parsed.invocation,
    preferences: dependencies.preferences,
    registry: dependencies.registry,
    maxPasses: parsed.maxPasses,
  });

  return {
    schemaVersion: 1,
    mode: "review-frontline-resolve",
    routing: { facts: routing.facts, decision: routing.decision },
    frontlineReview: semantic.frontlineReview,
    diagnostics: { routing: routing.diagnostics, source: semantic.diagnostics },
  };
}
