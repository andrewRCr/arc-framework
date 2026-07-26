/** Workflow-facing composition API for frontline semantic resolution. */

import { z } from "zod";

import {
  FrontlineResolveEnvelopeSchema,
} from "../core/review-command-envelope.js";
import { ReviewPassSchema, type ReviewPass } from "../core/review-pass.js";
import { FrontlineInvocationOverrideSchema } from "./frontline-resolution.js";
import { resolveFrontlineReview, type FrontlineSemanticRecord } from "./frontline-semantic.js";
import type {
  FrontlineSourcePreferenceReader,
  FrontlineSourceRegistry,
} from "./frontline-source.js";
import { resolveReviewRouting, type ReviewRoutingResolution } from "./routing.js";

export const FrontlineCommandRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  changeSet: z.unknown(),
  invocation: FrontlineInvocationOverrideSchema,
  pass: ReviewPassSchema.optional(),
  maxPasses: ReviewPassSchema.optional(),
}).superRefine((request, context) => {
  if (request.pass !== undefined && request.pass > (request.maxPasses ?? 1)) {
    context.addIssue({
      code: "custom",
      message: "frontline pass cannot exceed maxPasses",
      path: ["pass"],
    });
  }
});
export type FrontlineCommandRequest = z.infer<typeof FrontlineCommandRequestSchema>;

export interface FrontlineCommandResult {
  schemaVersion: 1;
  mode: "review-frontline-resolve";
  diagnostics: Array<{ code: string; message: string }>;
  payload: {
    routing: Pick<ReviewRoutingResolution, "facts" | "decision">;
    frontlineReview: FrontlineSemanticRecord;
    pass?: ReviewPass;
    maxPasses?: ReviewPass;
  };
  state: "skipped" | "offered" | "ready";
  nextAction: "none" | "bind-source" | "obtain-authorization" | "run-frontline";
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
  const payload = {
    routing: { facts: routing.facts, decision: routing.decision },
    frontlineReview: semantic.frontlineReview,
  };
  const diagnostics = [
    ...routing.diagnostics.map((path) => ({
      code: "routing-input-rejected",
      message: `Rejected or missing routing input: ${path}`,
    })),
    ...semantic.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.sourceId === undefined
        ? `${diagnostic.tier} frontline source preference could not be applied`
        : `${diagnostic.tier} frontline source '${diagnostic.sourceId}' could not be applied`,
    })),
  ];
  const base = {
    schemaVersion: 1,
    mode: "review-frontline-resolve",
    diagnostics,
  };
  if (semantic.frontlineReview.action === "skip") {
    return FrontlineResolveEnvelopeSchema.parse({
      ...base,
      state: "skipped",
      nextAction: "none",
      payload,
    });
  }
  if (semantic.frontlineReview.action === "offer") {
    return FrontlineResolveEnvelopeSchema.parse({
      ...base,
      state: "offered",
      nextAction: semantic.frontlineReview.source === null ? "bind-source" : "obtain-authorization",
      payload,
    });
  }
  return FrontlineResolveEnvelopeSchema.parse({
    ...base,
    state: "ready",
    nextAction: "run-frontline",
    payload: {
      ...payload,
      pass: parsed.pass ?? 1,
      maxPasses: semantic.frontlineReview.maxPasses,
    },
  });
}
