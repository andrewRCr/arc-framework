/** Zod authority for the logical independent-analysis delivery contract. */

import { z } from "zod";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const IndependentAnalysisContractSchema = z.strictObject({
  version: z.literal("independent-analysis/v1"),
  coverage: z.literal("complete-exact-change-set"),
  evaluatorBoundary: z.literal("independent-source-and-context"),
  rubric: z.strictObject({
    version: z.string().min(1),
    digest: CanonicalDigestSchema,
  }),
  findingFloor: z.literal("actionable-source-grounded"),
  cleanRule: z.literal("all-rubric-dimensions-considered"),
});
export type IndependentAnalysisContract = z.infer<typeof IndependentAnalysisContractSchema>;
