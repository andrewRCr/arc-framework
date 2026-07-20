/** Zod authority for the logical independent-analysis delivery contract. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const ReviewRubricIdentitySchema = z.strictObject({
  version: z.string().min(1),
  digest: CanonicalDigestSchema,
});
export type ReviewRubricIdentity = z.infer<typeof ReviewRubricIdentitySchema>;

export const IndependentAnalysisContractSchema = z.strictObject({
  version: z.literal("independent-analysis/v1"),
  coverage: z.literal("complete-exact-change-set"),
  evaluatorBoundary: z.literal("independent-source-and-context"),
  rubric: ReviewRubricIdentitySchema,
  findingFloor: z.literal("actionable-source-grounded"),
  cleanRule: z.literal("all-rubric-dimensions-considered"),
});
export type IndependentAnalysisContract = z.infer<typeof IndependentAnalysisContractSchema>;

/** Register the logical independent-analysis contract with a caller-owned registry. */
export function registerIndependentAnalysisSchema(registry: KernelRegistry): KernelRegistry {
  registry.register(IndependentAnalysisContractSchema, {
    id: "independent-analysis-contract",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
