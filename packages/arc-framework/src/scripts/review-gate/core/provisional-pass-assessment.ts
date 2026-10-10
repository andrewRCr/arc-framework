/** Typed provisional pass facts shown before a disposition is approved or performed. */

import { z } from "zod";

import { isMaterialSeverity } from "./review-convergence.js";
import { ReviewPassSchema } from "./review-pass.js";

/** What approving the proposal's fixes does to the lane: whether the head moves, and what that head then needs. */
export const ProvisionalFixConsequenceSchema = z.discriminatedUnion("kind", [
  /** No finding is fixed, so the reviewed head stands. */
  z.strictObject({ kind: z.literal("no-fix") }),
  /** The fixed head closes the lane without another pass. */
  z.strictObject({ kind: z.literal("lane-closes") }),
  /** The fixed head needs the lane's next pass, with the coverage it expects, or null where the lane selects it. */
  z.strictObject({
    kind: z.literal("next-pass"),
    coverage: z.enum(["complete", "incremental-when-proven"]).nullable(),
  }),
  /** The fixed head needs a pass beyond the configured ceiling. */
  z.strictObject({ kind: z.literal("ceiling-decision") }),
  /** Review status at the fixed head decides whether another pass is needed. */
  z.strictObject({ kind: z.literal("decided-at-fixed-head") }),
]);
export type ProvisionalFixConsequence = z.infer<typeof ProvisionalFixConsequenceSchema>;

export const ProvisionalPassAssessmentSchema = z.strictObject({
  status: z.literal("provisional"),
  lane: z.enum(["frontline", "standard"]),
  admittedLogicalPass: ReviewPassSchema,
  configuredMaxPasses: ReviewPassSchema,
  proposedSignal: z.strictObject({
    confirmedFindingCount: z.number().int().nonnegative(),
    maxConfirmedSeverity: z.enum(["minor", "major", "critical"]).nullable(),
    /** Whether the proposal fixes a major or critical finding, which needs another pass on every lane. */
    materialFix: z.boolean(),
  }),
  capPosition: z.enum(["below-ceiling", "at-ceiling", "above-ceiling"]),
  fixConsequence: ProvisionalFixConsequenceSchema,
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
  const consequence = assessment.fixConsequence.kind;
  const passFollows = consequence === "next-pass" || consequence === "ceiling-decision";
  if (signal.materialFix && !passFollows) {
    context.addIssue({
      code: "custom",
      path: ["fixConsequence"],
      message: "a material fix needs another pass",
    });
  }
  if (passFollows && (consequence === "next-pass") !== (position === "below-ceiling")) {
    context.addIssue({
      code: "custom",
      path: ["fixConsequence"],
      message: "the next pass must be below the ceiling, and a ceiling decision at or above it",
    });
  }
  const stopReason = consequence === "ceiling-decision" ? "cap-exhausted" : null;
  if (assessment.potentialStopReason !== stopReason) {
    context.addIssue({
      code: "custom",
      path: ["potentialStopReason"],
      message: "must match a fix consequence that needs a ceiling decision",
    });
  }
});
