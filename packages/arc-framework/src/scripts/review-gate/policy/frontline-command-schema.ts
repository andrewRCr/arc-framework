/** Request contract shared by the frontline action projection and resolver command. */

import { z } from "zod";

import { ReviewPassSchema } from "../core/review-pass.js";
import { FrontlineInvocationOverrideSchema } from "./frontline-resolution.js";

export const FrontlineCommandRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  changeSet: z.unknown(),
  invocation: FrontlineInvocationOverrideSchema,
  pass: ReviewPassSchema.optional(),
  maxPasses: ReviewPassSchema.optional(),
}).superRefine((request, context) => {
  if (request.pass !== undefined && request.pass > (request.maxPasses ?? 1)) {
    context.addIssue({
      code: "custom",
      message: "frontline pass cannot exceed maxPasses",
      path: ["pass"],
    });
  }
});
export type FrontlineCommandRequest = z.infer<typeof FrontlineCommandRequestSchema>;
