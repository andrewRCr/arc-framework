/** Typed provisional pass facts shown before a disposition is approved or performed. */

import { z } from "zod";

import { isMaterialSeverity } from "./review-convergence.js";
import { ReviewPassSchema } from "./review-pass.js";

export const ProvisionalPassAssessmentSchema = z.strictObject({
  status: z.literal("provisional"),
  lane: z.enum(["frontline", "standard"]),
  admittedLogicalPass: ReviewPassSchema,
  configuredMaxPasses: ReviewPassSchema,
  proposedSignal: z.strictObject({
    confirmedFindingCount: z.number().int().nonnegative(),
    maxConfirmedSeverity: z.enum(["minor", "major", "critical"]).nullable(),
    /** Whether the proposal fixes a major or critical finding, the one outcome that needs another pass. */
    materialFix: z.boolean(),
  }),
  capPosition: z.enum(["below-ceiling", "at-ceiling", "above-ceiling"]),
  potentialStopReason: z.literal("cap-exhausted").nullable(),
  nextPassAuthority: z.literal("none"),
  summaryText: z.string().trim().min(1),
}).superRefine((assessment, context) => {
  const position = assessment.admittedLogicalPass < assessment.configuredMaxPasses
    ? "below-ceiling"
    : assessment.admittedLogicalPass === assessment.configuredMaxPasses
      ? "at-ceiling"
      : "above-ceiling";
  if (assessment.capPosition !== position) {
    context.addIssue({ code: "custom", path: ["capPosition"], message: "must match the admitted pass and ceiling" });
  }
  const signal = assessment.proposedSignal;
  if ((signal.confirmedFindingCount === 0) !== (signal.maxConfirmedSeverity === null)) {
    context.addIssue({ code: "custom", path: ["proposedSignal"], message: "count and maximum severity must agree" });
  }
  if (signal.materialFix && !isMaterialSeverity(signal.maxConfirmedSeverity)) {
    context.addIssue({
      code: "custom",
      path: ["proposedSignal", "materialFix"],
      message: "a material fix requires a major or critical confirmed finding",
    });
  }
  const stopReason = signal.materialFix && position !== "below-ceiling" ? "cap-exhausted" : null;
  if (assessment.potentialStopReason !== stopReason) {
    context.addIssue({
      code: "custom",
      path: ["potentialStopReason"],
      message: "must match the proposed material fix and ceiling",
    });
  }
});
