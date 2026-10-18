/** Preserve source-selection diagnostics and executable remedies on review-status routes. */
import { z } from "zod";
import { SpineRemedySchema, spineRemedy } from "../integration/spine-refusal.js";
import type { ReviewResolveEnvelope } from "./policy/review-policy-driver.js";
import { singletonNeedsLocalPrepare } from "./singleton-local-prepare-action.js";
import { reviewStatusRouteArgv, type ReviewStatusRoute } from "./status-route.js";

export const ReviewDriverRefusalReasonSchema = z.enum([
  "material-fix-local-review-required", "material-fix-local-source-unconfigured", "hosted-incremental-unsupported", "singleton-local-coverage-required",
]);
export const ReviewDriverRefusalSchema = z.strictObject({
  state: z.literal("blocked"), reason: ReviewDriverRefusalReasonSchema,
  detail: z.string().min(1), remedy: SpineRemedySchema,
});

/** Carry a driver's source refusal without discarding its code or inventing an unavailable local action. */
export function projectReviewDriverRefusal(input: {
  readonly policy: ReviewResolveEnvelope;
  readonly route: ReviewStatusRoute;
  readonly allowOwnerStop?: boolean;
}): z.infer<typeof ReviewDriverRefusalSchema> | null {
  if (input.policy.state !== "unavailable") return null;
  const diagnostic = input.policy.diagnostics.find(item => ReviewDriverRefusalReasonSchema.safeParse(item.code).success);
  return projectReviewSourceRefusal({ diagnostic, route: input.route, allowOwnerStop: input.allowOwnerStop });
}

/** Render the source selector's own refusal before a continuation has acquired its review admission. */
export function projectReviewSourceRefusal(input: {
  readonly diagnostic?: ReviewResolveEnvelope["diagnostics"][number] | null;
  readonly route: ReviewStatusRoute;
  readonly allowOwnerStop?: boolean;
}): z.infer<typeof ReviewDriverRefusalSchema> | null {
  const diagnostic = input.diagnostic;
  const parsed = ReviewDriverRefusalReasonSchema.safeParse(diagnostic?.code);
  if (diagnostic === undefined || diagnostic === null || !parsed.success) return null;
  const reason = parsed.data;
  const unconfigured = reason === "material-fix-local-source-unconfigured";
  const correction = unconfigured
    ? "Add delegated-agent to review.standard_sources"
      + (input.allowOwnerStop === true ? ", or take the Owner's stop accepting that the fixes have not been re-examined" : "")
      + ", then re-run status"
    : reason === "hosted-incremental-unsupported"
      ? "Run the local fix check on delegated-agent, then re-run status"
      : "Re-run the next pass on delegated-agent to re-examine the repairs";
  return ReviewDriverRefusalSchema.parse({ state: "blocked", reason, detail: diagnostic.message,
    remedy: spineRemedy(diagnostic.message, correction,
      [...reviewStatusRouteArgv(input.route), ...(unconfigured ? [] : ["--source", "delegated-agent"])]) });
}

/** Refuse hosted incremental dispatch while preserving the caller's exact local retry route. */
export function projectHostedIncrementalRefusal(route: ReviewStatusRoute): z.infer<typeof ReviewDriverRefusalSchema> {
  const refusal = projectReviewSourceRefusal({ route, diagnostic: { code: "hosted-incremental-unsupported",
    message: "Hosted review requests use complete coverage; fix checks run locally." } });
  if (refusal === null) throw new Error("Hosted incremental refusal is missing its registered diagnostic.");
  return refusal;
}

/** Keep singleton coverage choices on the local prepare admission that can preserve them. */
export function projectSingletonLocalCoverageRefusal(input: {
  readonly route: ReviewStatusRoute;
  readonly coverage?: "complete" | "incremental";
  readonly request?: Parameters<typeof singletonNeedsLocalPrepare>[0];
  readonly terminalPolicyState?: ReviewResolveEnvelope["state"];
}): z.infer<typeof ReviewDriverRefusalSchema> | null {
  if (input.coverage === undefined || input.request === undefined
    || !singletonNeedsLocalPrepare(input.request, input.terminalPolicyState)) return null;
  const detail = "Review status cannot carry --coverage to the singleton's ordinary local prepare request.";
  return ReviewDriverRefusalSchema.parse({ state: "blocked", reason: "singleton-local-coverage-required", detail,
    remedy: spineRemedy(detail,
      "Re-run status without --coverage, then select local prepare's offered choice through coverageAdmission",
      reviewStatusRouteArgv(input.route)) });
}
