/** Shared positive safe-integer domain for review pass numbers and ceilings. */

import { z } from "zod";

export const ReviewPassSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export type ReviewPass = z.infer<typeof ReviewPassSchema>;

/** Number of standard-review passes already completed, including the valid zero state. */
export const CompletedReviewPassCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** Validated count of standard-review passes already completed. */
export type CompletedReviewPassCount = z.infer<typeof CompletedReviewPassCountSchema>;
