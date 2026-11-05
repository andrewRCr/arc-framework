/** Versioned explicit requests and complete observation bases for approval-root repair. */
import { z } from "zod";
import { SlugSchema, type KernelRegistry } from "../kernel/index.js";
import { OwnerIdentitySchema, StateVersionSchema, StoredUidSchema, RecordReferenceSchema, RecordVersionSchema } from "./identity.js";
import { RecordObservationSchema } from "./write.js";
import { WholeRecordConflictSchema } from "./conflict.js";
import { storeResultSchema } from "./refusal.js";
import { ReviewEvidenceSchema } from "./kinds/review/evidence/schema.js";
import { ReviewEvidenceRootSelectionSchema } from "./kinds/review/evidence-root-selection/schema.js";
import { ReviewCanonicalDigestSchema, ReviewIdentifierSchema } from "../../scripts/review-gate/core/gate-contract-v2-schema.js";

const ExactWorkItemSchema = OwnerIdentitySchema.and(z.strictObject({ type: z.literal("work-item"), name: SlugSchema, uid: StoredUidSchema }));
export const STORE_REPAIR_REVIEW_ROOTS_REQUEST_SCHEMA_ID = "store-repair-review-roots-request";
export const STORE_REPAIR_REVIEW_ROOTS_RESULT_SCHEMA_ID = "store-repair-review-roots-result";

/** Complete immutable facts compared again before the selector's atomic write. */
export const ReviewRootRepairBasisSchema = z.strictObject({
  workItem: ExactWorkItemSchema, producerId: ReviewIdentifierSchema, asOf: StateVersionSchema,
  evidence: z.array(RecordObservationSchema), roots: z.array(ReviewCanonicalDigestSchema).min(2),
  selector: RecordObservationSchema, outcome: RecordObservationSchema,
  selectorAlternatives: z.array(RecordObservationSchema),
  outcomeKey: z.string().min(1), resultDigest: ReviewCanonicalDigestSchema,
});
export type ReviewRootRepairBasis = z.infer<typeof ReviewRootRepairBasisSchema>;

const coordinates = { schemaVersion: z.literal(1), workItem: ExactWorkItemSchema, producerId: ReviewIdentifierSchema };
/** A read-only inventory or one explicitly attributed version-bound choice. */
export const ReviewRootRepairRequestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...coordinates, operation: z.literal("preview") }),
  z.strictObject({ ...coordinates, operation: z.literal("apply"), basis: ReviewRootRepairBasisSchema,
    selectedRoot: ReviewCanonicalDigestSchema, decidedBy: ReviewIdentifierSchema, reason: z.string().trim().min(1) }),
]);
export type ReviewRootRepairRequest = z.infer<typeof ReviewRootRepairRequestSchema>;

const handle = { workItem: ExactWorkItemSchema, producerId: ReviewIdentifierSchema };
const context = { schemaVersion: z.literal(1), ...handle,
  outcome: z.strictObject({ reference: RecordReferenceSchema, version: RecordVersionSchema,
    outcomeKey: z.string(), resultDigest: ReviewCanonicalDigestSchema.nullable() }),
  branches: z.array(z.strictObject({ root: ReviewCanonicalDigestSchema, records: z.array(z.strictObject({
    reference: RecordReferenceSchema, version: RecordVersionSchema, value: ReviewEvidenceSchema,
    performed: z.boolean(), settled: z.boolean(),
  })).min(1) })), eligibleChoices: z.array(ReviewCanonicalDigestSchema),
  selector: z.strictObject({ observation: RecordObservationSchema, value: ReviewEvidenceRootSelectionSchema.nullable(),
    alternatives: z.array(z.strictObject({ reference: RecordReferenceSchema, version: RecordVersionSchema, value: WholeRecordConflictSchema })) }),
};
/** Explicit repair states remain separate from the existing store refusal vocabulary. */
export const ReviewRootRepairResultSchema = storeResultSchema(z.discriminatedUnion("state", [
  z.strictObject({ ...context, state: z.literal("preview-ready"), basis: ReviewRootRepairBasisSchema }),
  z.strictObject({ ...context, state: z.literal("not-needed") }),
  z.strictObject({ ...context, state: z.literal("policy-blocked"), retryable: z.literal(false), condition: z.string().min(1) }),
  z.strictObject({ schemaVersion: z.literal(1), ...handle, state: z.literal("applied"), selectedRoot: ReviewCanonicalDigestSchema,
    roots: z.array(ReviewCanonicalDigestSchema).min(2), selector: z.strictObject({ reference: RecordReferenceSchema, version: RecordVersionSchema }) }),
]));
export type ReviewRootRepairResult = z.infer<typeof ReviewRootRepairResultSchema>;

/** Register the same request root the explicit command accepts. */
export function registerReviewRootRepairSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewRootRepairRequestSchema, { id: STORE_REPAIR_REVIEW_ROOTS_REQUEST_SCHEMA_ID, version: 1,
    migrationPosture: "strict-current", authored: "request" });
  registry.register(ReviewRootRepairResultSchema, { id: STORE_REPAIR_REVIEW_ROOTS_RESULT_SCHEMA_ID, version: 1,
    migrationPosture: "strict-current" });
  return registry;
}
