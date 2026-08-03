/** Runtime schemas for the canonical delivery-plan record family. */

import { z } from "zod";

import { SlugSchema, type KernelRegistry } from "../kernel/index.js";
import { ParentTaskIdSchema } from "../task-list/scanner.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const DeliveryPlanIdSchema = z.uuid();
const NonEmptyOpaqueStringSchema = z.string().min(1);
const NonEmptyTextSchema = z.string().trim().min(1);
const ArtifactBasenameSchema = z.string().min(1).refine(
  (value) => value !== "." && value !== ".." && !/[\\/\0]/u.test(value)
    && value.normalize("NFC") === value,
  "must be a safe basename",
);

const AuthoredDeliveryPlanMemberShape = {
  chunkKey: SlugSchema,
  title: NonEmptyTextSchema,
  contract: NonEmptyTextSchema,
  taskIds: z.array(ParentTaskIdSchema),
  designElementIds: z.array(NonEmptyOpaqueStringSchema),
  mainlineLandability: z.enum(["independently-landable", "integration-only"]),
};

const DeliveryPlanMemberShape = {
  ...AuthoredDeliveryPlanMemberShape,
  deliverableId: CanonicalDigestSchema,
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
  planId: DeliveryPlanIdSchema,
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
export const DeliveryPlanAuthoringInputV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("delivery-plan/v1"),
  projectId: NonEmptyOpaqueStringSchema.optional(),
  workUnitId: SlugSchema,
  design: z.strictObject({
    artifacts: z.array(z.strictObject({ artifactId: ArtifactBasenameSchema })).min(1).max(2),
    elements: z.array(z.strictObject({ elementId: NonEmptyOpaqueStringSchema })),
  }),
  tasks: z.strictObject({
    implementation: z.array(z.strictObject({ taskId: ParentTaskIdSchema })),
    verificationTaskId: ParentTaskIdSchema,
  }),
  entry: z.enum(["from-tasks", "from-branch"]),
  projection: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("wu-integration-target") }),
    z.strictObject({ kind: z.literal("stack-to-main") }),
  ]),
  members: z.array(z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("live"), ...AuthoredDeliveryPlanMemberShape }),
    z.strictObject({ status: z.literal("landed"), ...AuthoredDeliveryPlanMemberShape }),
  ])),
  seams: z.array(z.strictObject({
    seamKey: SlugSchema,
    title: NonEmptyTextSchema,
    acceptance: NonEmptyTextSchema,
    incidentChunkKeys: z.array(SlugSchema).min(2).refine(
      (keys) => new Set(keys).size === keys.length,
      "incident chunks must be distinct",
    ),
    designElementIds: z.array(NonEmptyOpaqueStringSchema),
  })),
}).superRefine((input, context) => {
  const memberKeys = new Set(input.members.map((member) => member.chunkKey));
  for (const [seamIndex, seam] of input.seams.entries()) {
    for (const [incidentIndex, chunkKey] of seam.incidentChunkKeys.entries()) {
      if (!memberKeys.has(chunkKey)) {
        context.addIssue({
          code: "custom",
          message: `unknown member chunk key: ${chunkKey}`,
          path: ["seams", seamIndex, "incidentChunkKeys", incidentIndex],
        });
      }
    }
  }
});
export type DeliveryPlanAuthoringInputV1 = z.infer<typeof DeliveryPlanAuthoringInputV1Schema>;

const FirstDeliveryPlanAuthoringInputV1Schema = DeliveryPlanAuthoringInputV1Schema.superRefine(
  (input, context) => {
    for (const [index, member] of input.members.entries()) {
      if (member.status === "landed") {
        context.addIssue({
          code: "custom",
          message: "first-revision members must be live",
          path: ["members", index, "status"],
        });
      }
    }
  },
);

/**
 * Validate authored input against the presence or absence of a prior plan revision.
 *
 * @param value - Candidate authored input.
 * @param priorRevision - The validated predecessor, or `null` for first authoring.
 * @returns The parsed authored input or its structural validation failure.
 */
export function validateDeliveryPlanAuthoringInputV1(
  value: unknown,
  priorRevision: DeliveryPlanV1 | null,
): ReturnType<typeof DeliveryPlanAuthoringInputV1Schema.safeParse> {
  return (priorRevision === null
    ? FirstDeliveryPlanAuthoringInputV1Schema
    : DeliveryPlanAuthoringInputV1Schema).safeParse(value);
}

/** Seam incidence resolved from authored chunk keys to derived deliverable identities. */
export interface ResolvedAuthoringSeamIncidence {
  readonly seamKey: string;
  readonly incidentDeliverableIds: readonly string[];
}

/**
 * Resolve authored seam incidence through the caller's deliverable-id derivation.
 *
 * @param input - Validated authored input whose seam references are known members.
 * @param deliverableIdForChunkKey - Derivation from one authored member key to its stable identity.
 * @returns Seam keys paired with their incident deliverable identities in authored order.
 */
export function resolveAuthoredSeamIncidence(
  input: DeliveryPlanAuthoringInputV1,
  deliverableIdForChunkKey: (chunkKey: string) => string,
): readonly ResolvedAuthoringSeamIncidence[] {
  return input.seams.map((seam) => ({
    seamKey: seam.seamKey,
    incidentDeliverableIds: seam.incidentChunkKeys.map((chunkKey) => (
      CanonicalDigestSchema.parse(deliverableIdForChunkKey(chunkKey))
    )),
  }));
}

/** Domain-separated preimage for a stable delivery-member identity. */
export const DeliveryDeliverableIdPreimageSchema = z.strictObject({
  domain: z.literal("arc.delivery.deliverable-id/v1"),
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("delivery-plan/v1"),
  planId: DeliveryPlanIdSchema,
  chunkKey: SlugSchema,
}).readonly();
export type DeliveryDeliverableIdPreimage = z.infer<typeof DeliveryDeliverableIdPreimageSchema>;

/** Domain-separated preimage for member and seam assurance subjects. */
export const DeliveryAssuranceSubjectIdPreimageSchema = z.discriminatedUnion("subjectKind", [
  z.strictObject({
    domain: z.literal("arc.delivery.assurance-subject-id/v1"),
    schemaVersion: z.literal(1),
    semanticsVersion: z.literal("delivery-plan/v1"),
    subjectKind: z.literal("member"),
    planId: DeliveryPlanIdSchema,
    deliverableId: CanonicalDigestSchema,
  }),
  z.strictObject({
    domain: z.literal("arc.delivery.assurance-subject-id/v1"),
    schemaVersion: z.literal(1),
    semanticsVersion: z.literal("delivery-plan/v1"),
    subjectKind: z.literal("seam"),
    planId: DeliveryPlanIdSchema,
    seamKey: SlugSchema,
  }),
]).readonly();
export type DeliveryAssuranceSubjectIdPreimage = z.infer<
  typeof DeliveryAssuranceSubjectIdPreimageSchema
>;

/** Compose every delivery-domain schema into a caller-owned registry. */
export function registerDeliveryDomainSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(DeliveryPlanV1Schema, {
    id: "delivery-plan",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(DeliveryPlanMemberV1Schema, {
    id: "delivery-plan-member",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(DeliveryPlanSeamV1Schema, {
    id: "delivery-plan-seam",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(DeliveryPlanAuthoringInputV1Schema, {
    id: "delivery-plan-authoring-input",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(DeliveryDeliverableIdPreimageSchema, {
    id: "delivery-deliverable-id-preimage",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(DeliveryAssuranceSubjectIdPreimageSchema, {
    id: "delivery-assurance-subject-id-preimage",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
