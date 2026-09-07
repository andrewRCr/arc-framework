/** Exemption-specific composition for transient planning-grooming changes. */

import { z } from "zod";

import { classifyPlanningLane } from "../../../lib/change-facts.js";
import { ChangeSetSchema } from "../../../lib/change-facts.schema.js";
import {
  PlanningGroomingReviewEnvelopeSchema,
} from "../core/review-command-envelope.js";
import {
  ReviewPlanningGroomingResolveRequestSchema,
} from "../core/planning-grooming-command-schema.js";
import { ReviewTargetSchema } from "../core/gate-contract-v2-schema.js";
import {
  ReviewMethodActivitySchema,
} from "./assurance-schema.js";
import { resolveReviewRouting } from "./routing.js";
import { projectStandardReviewObligation } from "./standard-review-projection.js";

const ResolvedTransientContextSchema = z.strictObject({
  state: z.literal("resolved"),
  assurance: z.strictObject({
    workContext: z.literal("errand"),
    workClass: z.literal("none"),
  }),
  activity: ReviewMethodActivitySchema,
  diagnostics: z.array(z.string()),
});

const PlanningGroomingCommandInputSchema = z.strictObject({
  request: ReviewPlanningGroomingResolveRequestSchema,
  target: ReviewTargetSchema,
  changeSet: ChangeSetSchema,
  context: z.union([
    ResolvedTransientContextSchema,
    z.strictObject({
      state: z.literal("not-applicable"),
      reason: z.literal("transient-vehicle-required"),
    }),
  ]),
}).superRefine((input, context) => {
  if (input.target.kind !== "change-set") {
    context.addIssue({
      code: "custom",
      path: ["target", "kind"],
      message: "planning-grooming exemption requires a change-set target",
    });
  }
  for (const key of ["baseRef", "diffBaseSha", "headSha"] as const) {
    if (input.target[key] !== input.request.target[key]) {
      context.addIssue({
        code: "custom",
        path: ["target", key],
        message: `derived target ${key} does not match the caller-held coordinate`,
      });
    }
  }
});

function ineligible(
  target: z.infer<typeof ReviewTargetSchema>,
  reason: "unknown-change-set" | "non-planning-change" | "transient-vehicle-required",
) {
  return PlanningGroomingReviewEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-planning-grooming-resolve",
    diagnostics: [{
      code: "planning-grooming-ineligible",
      message: reason === "unknown-change-set"
        ? "The exact Git change set could not be established."
        : reason === "non-planning-change"
          ? "The exact Git change is not composed solely of plain planning artifacts."
          : "Planning-grooming exemption is available only to an active transient work vehicle.",
    }],
    state: "not-eligible",
    nextAction: "continue-review",
    payload: { target, reason },
  });
}

/**
 * Derive both lane dispositions from one exact, repository-backed planning change.
 *
 * This command deliberately stops at applicability. It creates no review request,
 * operation, receipt, clearance, or merge authority.
 */
export function resolvePlanningGroomingReviewCommand(input: unknown) {
  const parsed = PlanningGroomingCommandInputSchema.parse(input);
  if (parsed.changeSet.changeSet === "unknown") {
    return ineligible(parsed.target, "unknown-change-set");
  }
  if (classifyPlanningLane(parsed.changeSet) !== "planning") {
    return ineligible(parsed.target, "non-planning-change");
  }
  if (parsed.context.state === "not-applicable") {
    return ineligible(parsed.target, parsed.context.reason);
  }

  const routing = resolveReviewRouting({
    schemaVersion: 1,
    changeSetState: "known",
    ...parsed.request.routingFacts,
    assurance: parsed.context.assurance,
    activity: parsed.context.activity,
  });
  const standardReview = projectStandardReviewObligation(routing.decision);
  const exempt = routing.decision.frontlineAction === "skip"
    && standardReview.obligation === "exempt";
  const payload = {
    target: parsed.target,
    routing: { facts: routing.facts, decision: routing.decision },
    frontline: routing.decision.frontlineAction === "skip"
      ? { state: "skipped" as const, nextAction: "none" as const }
      : { state: "continue-review" as const, nextAction: "continue-review" as const },
    standard: standardReview.obligation === "exempt"
      ? { state: "exempt" as const, nextAction: "none" as const, obligation: standardReview }
      : {
          state: "continue-review" as const,
          nextAction: "continue-review" as const,
          obligation: standardReview,
        },
  };
  return PlanningGroomingReviewEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-planning-grooming-resolve",
    diagnostics: [
      ...parsed.context.diagnostics.map((message) => ({ code: "method-activity", message })),
      ...routing.diagnostics.map((path) => ({
        code: "routing-input-rejected",
        message: `Rejected routing input: ${path}`,
      })),
    ],
    state: exempt ? "exempt" : "review-required",
    nextAction: exempt ? "none" : "continue-review",
    payload,
  });
}
