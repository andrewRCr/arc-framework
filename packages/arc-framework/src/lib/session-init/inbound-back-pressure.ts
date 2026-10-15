/** Current-work-unit inbound pressure contract and dormant session projection. */
import { z } from "zod";
import { SessionActionsSchema } from "./actions.js";

/** Inbound figures and thresholds, or no list while the checkout-backed lifecycle is active. */
export const InboundBackPressureResultSchema = z.strictObject({
  pendingCount: z.number().int().nonnegative(),
  oldestAgeDays: z.number().nonnegative().nullable(),
  countThreshold: z.number().int().nonnegative(),
  ageThresholdDays: z.number().nonnegative(),
  actions: SessionActionsSchema.optional(),
}).nullable();
export type InboundBackPressureResult = z.infer<typeof InboundBackPressureResultSchema>;

/** Report no inbound list while the checkout-backed lifecycle is active. */
export function runInboundBackPressure(): InboundBackPressureResult {
  return null;
}
