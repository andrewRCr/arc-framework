/** Runtime schemas for the canonical delivery-plan record family. */

import { z } from "zod";

import { SlugSchema } from "../kernel/index.js";
import { ParentTaskIdSchema } from "../task-list/scanner.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const NonEmptyOpaqueStringSchema = z.string().min(1);
const NonEmptyTextSchema = z.string().trim().min(1);
const ArtifactBasenameSchema = z.string().min(1).refine(
  (value) => value !== "." && value !== ".." && !/[\\/\0]/u.test(value)
    && value.normalize("NFC") === value,
  "must be a safe basename",
);

const DeliveryPlanMemberShape = {
  chunkKey: SlugSchema,
  deliverableId: CanonicalDigestSchema,
  title: NonEmptyTextSchema,
  contract: NonEmptyTextSchema,
  taskIds: z.array(ParentTaskIdSchema),
  designElementIds: z.array(NonEmptyOpaqueStringSchema),
  mainlineLandability: z.enum(["independently-landable", "integration-only"]),
  assuranceSubjectId: CanonicalDigestSchema,
  semanticFingerprint: CanonicalDigestSchema,
};

/** A delivery member whose semantic fingerprint remains derivable. */
export const LiveDeliveryPlanMemberV1Schema = z.strictObject({
  status: z.literal("live"),
  ...DeliveryPlanMemberShape,
});

/** A landed delivery member carrying its frozen semantic fingerprint. */
export const LandedDeliveryPlanMemberV1Schema = z.strictObject({
  status: z.literal("landed"),
  ...DeliveryPlanMemberShape,
});

/** Canonical tagged delivery-member schema. */
export const DeliveryPlanMemberV1Schema = z.discriminatedUnion("status", [
  LiveDeliveryPlanMemberV1Schema,
  LandedDeliveryPlanMemberV1Schema,
]);
export type DeliveryPlanMemberV1 = z.infer<typeof DeliveryPlanMemberV1Schema>;

/** Canonical cross-member seam schema. */
export const DeliveryPlanSeamV1Schema = z.strictObject({
  seamKey: SlugSchema,
  title: NonEmptyTextSchema,
  acceptance: NonEmptyTextSchema,
  incidentDeliverableIds: z.array(CanonicalDigestSchema).min(2).refine(
    (ids) => new Set(ids).size === ids.length,
    "incident deliverables must be distinct",
  ),
  ownerDeliverableId: CanonicalDigestSchema,
  designElementIds: z.array(NonEmptyOpaqueStringSchema),
  assuranceSubjectId: CanonicalDigestSchema,
  semanticFingerprint: CanonicalDigestSchema,
});
export type DeliveryPlanSeamV1 = z.infer<typeof DeliveryPlanSeamV1Schema>;

/** Canonical delivery-plan record schema. */
export const DeliveryPlanV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("delivery-plan/v1"),
  projectId: NonEmptyOpaqueStringSchema.optional(),
  workUnitId: SlugSchema,
  planId: z.uuid(),
  planRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  previousPlanDigest: CanonicalDigestSchema.nullable(),
  design: z.strictObject({
    artifacts: z.array(z.strictObject({
      artifactId: ArtifactBasenameSchema,
      revisionDigest: CanonicalDigestSchema,
    })),
    elements: z.array(z.strictObject({
      elementId: NonEmptyOpaqueStringSchema,
      semanticDigest: CanonicalDigestSchema,
    })),
  }),
  tasks: z.strictObject({
    inventoryDigest: CanonicalDigestSchema,
    implementation: z.array(z.strictObject({
      taskId: ParentTaskIdSchema,
      semanticDigest: CanonicalDigestSchema,
    })),
    verificationTaskId: ParentTaskIdSchema,
  }),
  entry: z.enum(["from-tasks", "from-branch"]),
  projection: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("wu-integration-target") }),
    z.strictObject({ kind: z.literal("stack-to-main") }),
  ]),
  members: z.array(DeliveryPlanMemberV1Schema),
  seams: z.array(DeliveryPlanSeamV1Schema),
  planDigest: CanonicalDigestSchema,
}).superRefine((plan, context) => {
  if (plan.planRevision !== 1) return;
  for (const [index, member] of plan.members.entries()) {
    if (member.status === "landed") {
      context.addIssue({
        code: "custom",
        message: "first-revision members must be live",
        path: ["members", index, "status"],
      });
    }
  }
});
export type DeliveryPlanV1 = z.infer<typeof DeliveryPlanV1Schema>;

/** Authored delivery-plan input before identities and digests are derived. */
export const DeliveryPlanAuthoringInputV1Schema = z.unknown();
