/** Shared positive safe-integer domain for review pass numbers and ceilings. */

import { z } from "zod";

export const ReviewPassSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export type ReviewPass = z.infer<typeof ReviewPassSchema>;
