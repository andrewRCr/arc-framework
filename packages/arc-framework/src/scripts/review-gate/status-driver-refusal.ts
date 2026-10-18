/** Preserve source-selection diagnostics and executable remedies on review-status routes. */
import { z } from "zod";
import { SpineRemedySchema, spineRemedy } from "../integration/spine-refusal.js";
import type { ReviewResolveEnvelope } from "./policy/review-policy-driver.js";
import { reviewStatusRouteArgv, type ReviewStatusRoute } from "./status-route.js";

export const ReviewDriverRefusalReasonSchema = z.enum([
  "material-fix-local-review-required", "material-fix-local-source-unconfigured",
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
  if (diagnostic === undefined) return null;
  const reason = ReviewDriverRefusalReasonSchema.parse(diagnostic.code);
  const unconfigured = reason === "material-fix-local-source-unconfigured";
  const correction = unconfigured
    ? "Add delegated-agent to review.standard_sources"
      + (input.allowOwnerStop === true ? ", or take the Owner's stop accepting that the fixes have not been re-examined" : "")
      + ", then re-run status"
    : "Re-run the next pass on delegated-agent to re-examine the repairs";
  return ReviewDriverRefusalSchema.parse({ state: "blocked", reason, detail: diagnostic.message,
    remedy: spineRemedy(diagnostic.message, correction,
      [...reviewStatusRouteArgv(input.route), ...(unconfigured ? [] : ["--source", "delegated-agent"])]) });
}
