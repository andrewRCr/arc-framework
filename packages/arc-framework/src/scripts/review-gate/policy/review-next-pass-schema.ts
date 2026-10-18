/** Internal next-pass context shared by evidence composition and the policy reducer. */
import { z } from "zod";
import { IncrementalReviewScopeSchema } from "../core/incremental-review-scope.js";

/** Internal facts derived from immutable results and approved responses, never command inputs. */
export const ReviewNextPassContextSchema = z.strictObject({
  convergence: z.enum(["none", "converged", "pending", "unconverged"]),
  responseDue: z.boolean(),
  incremental: z.strictObject({ basis: z.enum(["fix-check", "delta-check"]), scope: IncrementalReviewScopeSchema }).nullable(),
}).readonly();
export type ReviewNextPassContext = z.infer<typeof ReviewNextPassContextSchema>;


/** Refuse standard-only derived facts on the opening frontline lane. */
export function validateReviewNextPassContext(
  request: { readonly lane: "frontline" | "standard"; readonly nextPassContext?: ReviewNextPassContext },
  context: z.RefinementCtx,
): void {
  if (request.lane === "standard" && request.nextPassContext === undefined) {
    context.addIssue({ code: "custom", path: ["nextPassContext"],
      message: "standard review requires repository-derived next-pass context" });
  }
  if (request.lane === "frontline" && request.nextPassContext !== undefined) {
    context.addIssue({ code: "custom", path: ["nextPassContext"],
      message: "next-pass context can be applied only to the standard lane" });
  }
}
