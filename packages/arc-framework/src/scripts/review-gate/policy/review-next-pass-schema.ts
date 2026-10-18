/** Internal next-pass context shared by evidence composition and the policy reducer. */
import { z } from "zod";
import { IncrementalReviewScopeSchema } from "../core/incremental-review-scope.js";

/** Internal facts derived from immutable results and approved responses, never command inputs. */
export const ReviewNextPassContextSchema = z.strictObject({
  convergence: z.enum(["none", "converged", "pending", "unconverged"]),
  responseDue: z.boolean(),
  incremental: z.strictObject({ basis: z.literal("fix-check"), scope: IncrementalReviewScopeSchema }).nullable(),
}).readonly();
export type ReviewNextPassContext = z.infer<typeof ReviewNextPassContextSchema>;

