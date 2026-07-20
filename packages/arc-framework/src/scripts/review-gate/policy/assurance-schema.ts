/** Zod authority for method activity and work-unit assurance inputs. */

import { z } from "zod";

export const WorkContextSchema = z.enum(["unscoped", "errand", "work-unit"]);
export type WorkContext = z.infer<typeof WorkContextSchema>;

export const RoutingWorkClassSchema = z.enum(["none", "Light", "Heavy", "Novel"]);
export type RoutingWorkClass = z.infer<typeof RoutingWorkClassSchema>;

export const ReviewMethodActivitySchema = z.strictObject({
  selfReview: z.boolean(),
  frontlineReview: z.boolean(),
});
export type ReviewMethodActivity = z.infer<typeof ReviewMethodActivitySchema>;

export const ReviewAssuranceInputSchema = z.strictObject({
  workContext: WorkContextSchema,
  workClass: RoutingWorkClassSchema,
}).refine((input) => (input.workContext === "work-unit") === (input.workClass !== "none"), {
  message: "only work-unit context carries a work class",
});
export type ReviewAssuranceInput = z.infer<typeof ReviewAssuranceInputSchema>;
