/** Zod authority for the logical independent-analysis delivery contract. */

import { z } from "zod";

import {
  canonicalize,
  sortByCanonicalBytes,
  type KernelRegistry,
} from "../../../lib/kernel/index.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const SortedUniqueStringsSchema = z.array(z.string().min(1)).min(1).refine((values) => {
  const keys = values.map(canonicalize);
  return new Set(keys).size === keys.length
    && sortByCanonicalBytes(values).map(canonicalize).every((key, index) => key === keys[index]);
}, { message: "identity lists must be sorted and unique" }).readonly();
const ReviewGuidanceEntrySchema = z.strictObject({
  path: z.string().min(1),
  content: z.string().min(1),
});
const SortedUniqueGuidanceEntriesSchema = z.array(ReviewGuidanceEntrySchema).min(1).refine((values) => {
  const keys = values.map(canonicalize);
  return new Set(keys).size === keys.length
    && sortByCanonicalBytes(values).map(canonicalize).every((key, index) => key === keys[index]);
}, { message: "guidance entries must be sorted and unique" }).readonly();

export const ReviewRubricIdentitySchema = z.strictObject({
  version: z.string().min(1),
  digest: CanonicalDigestSchema,
});
export type ReviewRubricIdentity = z.infer<typeof ReviewRubricIdentitySchema>;

export const IndependentAnalysisIdentityFieldsSchema = z.strictObject({
  coverage: z.strictObject({
    scope: z.string().min(1),
    targetBinding: z.string().min(1),
  }).readonly(),
  evaluatorBoundary: z.strictObject({
    actorSeparation: z.string().min(1),
    contextSource: z.string().min(1),
    excludedContext: SortedUniqueStringsSchema,
  }).readonly(),
  rubric: z.strictObject({
    version: z.string().min(1),
    dimensions: SortedUniqueStringsSchema,
  }).readonly(),
  findingFloor: SortedUniqueStringsSchema,
  cleanRule: z.strictObject({
    requiredCoverage: z.string().min(1),
    requiredDimensionTreatment: z.string().min(1),
    nonCleanResults: SortedUniqueStringsSchema,
  }).readonly(),
});
export type IndependentAnalysisIdentityFields = z.infer<typeof IndependentAnalysisIdentityFieldsSchema>;

export const IndependentAnalysisContractSchema = z.strictObject({
  version: z.string().regex(/^independent-analysis\/v[1-9][0-9]*$/u),
  ...IndependentAnalysisIdentityFieldsSchema.shape,
});
export type IndependentAnalysisContract = z.infer<typeof IndependentAnalysisContractSchema>;

export const IndependentAnalysisRubricDigestPreimageSchema = z.strictObject({
  domain: z.literal("arc.independent-analysis.rubric-digest/v1"),
  ...IndependentAnalysisContractSchema.shape,
}).readonly();
export type IndependentAnalysisRubricDigestPreimage = z.infer<
  typeof IndependentAnalysisRubricDigestPreimageSchema
>;

export const ReviewGuidanceDigestPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-guidance.digest/v2"),
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-gate/v2"),
  carrierId: z.string().min(1),
  baseline: IndependentAnalysisContractSchema,
  projectAugmentation: SortedUniqueGuidanceEntriesSchema,
}).readonly();
export type ReviewGuidanceDigestPreimage = z.infer<typeof ReviewGuidanceDigestPreimageSchema>;

/** Register the logical independent-analysis contract with a caller-owned registry. */
export function registerIndependentAnalysisSchema(registry: KernelRegistry): KernelRegistry {
  registry.register(IndependentAnalysisRubricDigestPreimageSchema, {
    id: "independent-analysis-rubric-digest-preimage",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(IndependentAnalysisContractSchema, {
    id: "independent-analysis-contract",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewGuidanceDigestPreimageSchema, {
    id: "review-guidance-digest-preimage",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
