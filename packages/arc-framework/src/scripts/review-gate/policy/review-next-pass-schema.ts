/** Next-pass context and the next look's coverage it settles, shared by evidence composition and the policy reducer. */
import { z } from "zod";
import { IncrementalReviewScopeSchema } from "../core/incremental-review-scope.js";

/** Internal facts derived from immutable results and approved responses, never command inputs. */
export const ReviewNextPassContextSchema = z.strictObject({
  completePasses: z.number().int().nonnegative(),
  convergence: z.enum(["none", "converged", "pending", "unconverged"]),
  responseDue: z.boolean(),
  incremental: z.strictObject({ basis: z.enum(["fix-check", "delta-check"]), scope: IncrementalReviewScopeSchema }).nullable(),
}).readonly();
export type ReviewNextPassContext = z.infer<typeof ReviewNextPassContextSchema>;


/** Require next-pass facts when standard review can run, and keep them off the frontline lane. */
export function validateReviewNextPassContext(
  request: {
    readonly lane: "frontline" | "standard";
    readonly sources: readonly string[];
    readonly standardReview: { readonly obligation: string };
    readonly nextPassContext?: ReviewNextPassContext;
  },
  context: z.RefinementCtx,
): void {
  if (request.lane === "standard" && request.sources.length > 0
    && request.standardReview.obligation !== "exempt" && request.nextPassContext === undefined) {
    context.addIssue({ code: "custom", path: ["nextPassContext"],
      message: "standard review requires repository-derived next-pass context" });
  }
  if (request.lane === "frontline" && request.nextPassContext !== undefined) {
    context.addIssue({ code: "custom", path: ["nextPassContext"],
      message: "next-pass context can be applied only to the standard lane" });
  }
}

type NextLookRequest = {
  readonly lane: "frontline" | "standard";
  readonly nextPassContext?: ReviewNextPassContext;
  readonly chosenCoverage?: "complete" | "incremental";
};

/** Whether the next standard look is an incremental one, which runs outside the complete-pass ceiling. */
export function incrementalNextPass(request: NextLookRequest): boolean {
  return request.lane === "standard" && request.nextPassContext?.incremental != null && request.chosenCoverage !== "complete";
}

/** Settle the next standard look's coverage as the ceiling counts it, or null while preparation offers the choice. */
export function nextLookCoverage(request: NextLookRequest): "complete" | "incremental" | null {
  if (request.lane !== "standard") return null;
  if (!incrementalNextPass(request)) return "complete";
  return request.chosenCoverage === "incremental" || request.nextPassContext?.incremental?.basis === "delta-check"
    ? "incremental" : null;
}
