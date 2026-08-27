/** Runtime schemas for the canonical delivery-plan record family. */

import { z } from "zod";

import { SlugSchema, type KernelRegistry } from "../kernel/index.js";
import { ParentTaskIdSchema } from "../task-list/scanner.js";

/** Runtime authority for delivery-domain canonical digests. */
export const DeliveryCanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
/** Minted stable identity for one delivery plan across all revisions. */
export const DeliveryPlanIdSchema = z.uuid().overwrite((value) => value.toLowerCase());
export type DeliveryPlanId = z.infer<typeof DeliveryPlanIdSchema>;
/** Runtime authority for non-empty opaque delivery identifiers. */
export const DeliveryOpaqueIdSchema = z.string().min(1);
const NonEmptyTextSchema = z.string().trim().min(1);
/** Runtime authority for safe design-artifact basenames. */
export const DeliveryArtifactBasenameSchema = z.string().min(1).refine(
  (value) => value !== "." && value !== ".." && !/[\\/\0]/u.test(value)
    && value.normalize("NFC") === value,
  "must be a safe basename",
);

/** Semantic role assigned to one ordered parent task in a delivery inventory. */
export const DeliveryTaskRoleV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("implementation") }),
  z.strictObject({
    kind: z.literal("verification"),
    scope: NonEmptyTextSchema,
  }),
]);
export type DeliveryTaskRoleV1 = z.infer<typeof DeliveryTaskRoleV1Schema>;

/** Canonical parent task with its role-sensitive semantic digest. */
export const DeliveryTaskInventoryParentV1Schema = z.strictObject({
  taskId: ParentTaskIdSchema,
  semanticDigest: DeliveryCanonicalDigestSchema.nullable(),
  role: DeliveryTaskRoleV1Schema,
}).superRefine((task, context) => {
  const isWorkUnitVerification = task.role.kind === "verification"
    && task.role.scope === "work-unit";
  if (isWorkUnitVerification !== (task.semanticDigest === null)) {
    context.addIssue({
      code: "custom",
      message: isWorkUnitVerification
        ? "work-unit verification tasks must not carry a semantic digest"
        : "assignable tasks must carry a semantic digest",
      path: ["semanticDigest"],
    });
  }
});

const DeliveryPlanAuthoringTaskParentV1Schema = z.strictObject({
  taskId: ParentTaskIdSchema,
  role: DeliveryTaskRoleV1Schema,
});

const AuthoredDeliveryPlanMemberShape = {
  chunkKey: SlugSchema,
  title: NonEmptyTextSchema,
  contract: NonEmptyTextSchema,
  taskIds: z.array(ParentTaskIdSchema),
  designElementIds: z.array(DeliveryOpaqueIdSchema),
  mainlineLandability: z.enum(["independently-landable", "integration-only"]),
};

const DeliveryPlanMemberShape = {
  ...AuthoredDeliveryPlanMemberShape,
  deliverableId: DeliveryCanonicalDigestSchema,
  semanticFingerprint: DeliveryCanonicalDigestSchema,
};

/** Canonical intent-only delivery-member schema. */
export const DeliveryPlanMemberV1Schema = z.strictObject(DeliveryPlanMemberShape);
export type DeliveryPlanMemberV1 = z.infer<typeof DeliveryPlanMemberV1Schema>;

/** Canonical cross-member seam schema. */
export const DeliveryPlanSeamV1Schema = z.strictObject({
  seamKey: SlugSchema,
  title: NonEmptyTextSchema,
  acceptance: NonEmptyTextSchema,
  incidentDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(2).refine(
    (ids) => new Set(ids).size === ids.length,
    "incident deliverables must be distinct",
  ),
  ownerDeliverableId: DeliveryCanonicalDigestSchema,
  designElementIds: z.array(DeliveryOpaqueIdSchema),
  semanticFingerprint: DeliveryCanonicalDigestSchema,
});
export type DeliveryPlanSeamV1 = z.infer<typeof DeliveryPlanSeamV1Schema>;

/** Canonical delivery-plan record schema. */
export const DeliveryPlanV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("delivery-plan/v1"),
  projectId: DeliveryOpaqueIdSchema.optional(),
  workUnitId: SlugSchema,
  planId: DeliveryPlanIdSchema,
  planRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  previousPlanDigest: DeliveryCanonicalDigestSchema.nullable(),
  design: z.strictObject({
    artifacts: z.array(z.strictObject({
      artifactId: DeliveryArtifactBasenameSchema,
      revisionDigest: DeliveryCanonicalDigestSchema,
    })).min(1).max(2),
    elements: z.array(z.strictObject({
      elementId: DeliveryOpaqueIdSchema,
      semanticDigest: DeliveryCanonicalDigestSchema,
    })),
  }),
  tasks: z.strictObject({
    inventoryDigest: DeliveryCanonicalDigestSchema,
    parents: z.array(DeliveryTaskInventoryParentV1Schema),
  }),
  entry: z.enum(["from-tasks", "from-branch"]),
  projection: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("wu-integration-target") }),
    z.strictObject({ kind: z.literal("stack-to-main") }),
  ]),
  members: z.array(DeliveryPlanMemberV1Schema).min(1),
  seams: z.array(DeliveryPlanSeamV1Schema),
  planDigest: DeliveryCanonicalDigestSchema,
});
export type DeliveryPlanV1 = z.infer<typeof DeliveryPlanV1Schema>;

/** Authored delivery-plan input before identities and digests are derived. */
export const DeliveryPlanAuthoringInputV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("delivery-plan/v1"),
  projectId: DeliveryOpaqueIdSchema.optional(),
  workUnitId: SlugSchema,
  design: z.strictObject({
    artifacts: z.array(z.strictObject({ artifactId: DeliveryArtifactBasenameSchema })).min(1).max(2),
    elements: z.array(z.strictObject({ elementId: DeliveryOpaqueIdSchema })),
  }),
  tasks: z.strictObject({
    parents: z.array(DeliveryPlanAuthoringTaskParentV1Schema),
  }),
  entry: z.enum(["from-tasks", "from-branch"]),
  projection: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("wu-integration-target") }),
    z.strictObject({ kind: z.literal("stack-to-main") }),
  ]),
  members: z.array(z.strictObject(AuthoredDeliveryPlanMemberShape)).min(1),
  seams: z.array(z.strictObject({
    seamKey: SlugSchema,
    title: NonEmptyTextSchema,
    acceptance: NonEmptyTextSchema,
    incidentChunkKeys: z.array(SlugSchema).min(2).refine(
      (keys) => new Set(keys).size === keys.length,
      "incident chunks must be distinct",
    ),
    designElementIds: z.array(DeliveryOpaqueIdSchema),
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

const PositiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const DeliveryGitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);

/** Exact destination objects observed for one selected target ref. */
export const DeliveryTargetCoordinatesV1Schema = z.strictObject({
  head: DeliveryGitObjectIdSchema,
  tree: DeliveryGitObjectIdSchema,
});
export type DeliveryTargetCoordinatesV1 = z.infer<typeof DeliveryTargetCoordinatesV1Schema>;

/** Exact source objects observed for one selected member ref. */
export const DeliveryMemberCoordinatesV1Schema = z.strictObject({
  base: DeliveryGitObjectIdSchema,
  head: DeliveryGitObjectIdSchema,
  tree: DeliveryGitObjectIdSchema,
});
export type DeliveryMemberCoordinatesV1 = z.infer<typeof DeliveryMemberCoordinatesV1Schema>;

/** One provider-owned change-request handle bound to a delivery member. */
export const DeliveryChangeRequestV1Schema = z.strictObject({
  providerId: DeliveryOpaqueIdSchema,
  changeRequestId: DeliveryOpaqueIdSchema,
});
export type DeliveryChangeRequestV1 = z.infer<typeof DeliveryChangeRequestV1Schema>;

const DeliveryOperationMemberSnapshotV1Schema = z.strictObject({
  deliverableId: DeliveryCanonicalDigestSchema,
  ref: DeliveryOpaqueIdSchema.nullable(),
  changeRequest: DeliveryChangeRequestV1Schema.nullable(),
  coordinates: DeliveryMemberCoordinatesV1Schema.nullable(),
});

/** Generic exact positions used before and after one external mutation. */
export const DeliveryOperationSnapshotV1Schema = z.strictObject({
  target: z.strictObject({
    ref: DeliveryOpaqueIdSchema,
    coordinates: DeliveryTargetCoordinatesV1Schema.nullable(),
  }).nullable(),
  members: z.array(DeliveryOperationMemberSnapshotV1Schema).refine(
    (members) => new Set(members.map((member) => member.deliverableId)).size === members.length,
    "operation snapshot members must be distinct",
  ),
});
export type DeliveryOperationSnapshotV1 = z.infer<typeof DeliveryOperationSnapshotV1Schema>;

export const DeliveryOperationCommonV1Schema = z.strictObject({
  operationId: DeliveryOpaqueIdSchema,
  affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1).refine(
    (ids) => new Set(ids).size === ids.length,
    "affected deliverables must be distinct",
  ),
  stateRevision: PositiveSafeIntegerSchema,
  boundPlanDigest: DeliveryCanonicalDigestSchema,
  before: DeliveryOperationSnapshotV1Schema,
  requested: DeliveryOperationSnapshotV1Schema,
});

export const DeliveryPublishEffectV1Schema = z.strictObject({
  providerId: DeliveryOpaqueIdSchema,
  repository: DeliveryOpaqueIdSchema,
  headRef: DeliveryOpaqueIdSchema,
  headSha: DeliveryGitObjectIdSchema,
  baseRef: DeliveryOpaqueIdSchema,
  draft: z.boolean(),
});
export type DeliveryPublishEffectV1 = z.infer<typeof DeliveryPublishEffectV1Schema>;

/** Live repository-policy decision bound to one intermediate delivery mutation. */
export const DeliveryMergePolicyBindingV1Schema = z.strictObject({
  repository: DeliveryOpaqueIdSchema,
  stackPosition: z.literal("intermediate"),
  method: z.literal("merge"),
  allowedMethods: z.array(z.enum(["merge", "rebase", "squash"])).min(1).refine(
    (methods) => new Set(methods).size === methods.length && methods.includes("merge"),
    "allowed methods must be distinct and include merge",
  ),
  policyFingerprint: DeliveryCanonicalDigestSchema,
});
export type DeliveryMergePolicyBindingV1 = z.infer<typeof DeliveryMergePolicyBindingV1Schema>;

export const DeliveryLandEffectV1Schema = z.strictObject({
  providerId: DeliveryOpaqueIdSchema,
  repository: DeliveryOpaqueIdSchema,
  changeRequestId: DeliveryOpaqueIdSchema,
  headSha: DeliveryGitObjectIdSchema,
  baseRef: DeliveryOpaqueIdSchema,
  targetRef: DeliveryOpaqueIdSchema,
  strategy: z.literal("merge"),
  mergePolicy: DeliveryMergePolicyBindingV1Schema,
}).superRefine((effect, context) => {
  if (effect.repository !== effect.mergePolicy.repository) {
    context.addIssue({
      code: "custom",
      path: ["mergePolicy", "repository"],
      message: "merge policy repository must match the landing effect repository",
    });
  }
});
export type DeliveryLandEffectV1 = z.infer<typeof DeliveryLandEffectV1Schema>;

/** Exact, explicitly selected repair of the retained terminal change request. */
export const DeliveryTopRemedyEffectV1Schema = z.strictObject({
  providerId: DeliveryOpaqueIdSchema,
  repository: DeliveryOpaqueIdSchema,
  changeRequestId: DeliveryOpaqueIdSchema,
  headRef: DeliveryOpaqueIdSchema,
  headSha: DeliveryGitObjectIdSchema,
  triggerRef: DeliveryOpaqueIdSchema,
  triggerHeadSha: DeliveryGitObjectIdSchema,
  fromBaseRef: DeliveryOpaqueIdSchema,
  protectedBaseRef: DeliveryOpaqueIdSchema,
  action: z.enum(["retarget", "reopen-and-retarget"]),
});
export type DeliveryTopRemedyEffectV1 = z.infer<typeof DeliveryTopRemedyEffectV1Schema>;

export const DeliveryHostEffectIdentityV1Schema = z.strictObject({
  providerId: DeliveryOpaqueIdSchema,
  effectId: DeliveryOpaqueIdSchema,
});
export type DeliveryHostEffectIdentityV1 = z.infer<typeof DeliveryHostEffectIdentityV1Schema>;

/** One crash-recoverable reservation for an external delivery mutation. */
export const DeliveryActiveOperationV1Schema = z.discriminatedUnion("kind", [
  DeliveryOperationCommonV1Schema.extend({
    kind: z.literal("materialize"),
  }),
  DeliveryOperationCommonV1Schema.extend({
    kind: z.literal("rewrite"),
    mode: z.enum(["review-fix", "selected-change", "provider-adoption", "provider-refresh"]),
  }),
  DeliveryOperationCommonV1Schema.extend({
    kind: z.literal("teardown"),
  }),
  DeliveryOperationCommonV1Schema.extend({
    kind: z.literal("publish"),
    effect: DeliveryPublishEffectV1Schema,
  }),
  DeliveryOperationCommonV1Schema.extend({
    kind: z.literal("land"),
    mode: z.enum(["sequential", "native"]),
    effect: DeliveryLandEffectV1Schema,
    effectIdentity: DeliveryHostEffectIdentityV1Schema.nullable(),
  }),
  DeliveryOperationCommonV1Schema.extend({
    kind: z.literal("top-remedy"),
    effect: DeliveryTopRemedyEffectV1Schema,
  }),
]);
export type DeliveryActiveOperationV1 = z.infer<typeof DeliveryActiveOperationV1Schema>;

const DeliveryStateMemberV1Schema = z.strictObject({
  deliverableId: DeliveryCanonicalDigestSchema,
  ref: DeliveryOpaqueIdSchema.nullable(),
  changeRequest: DeliveryChangeRequestV1Schema.nullable(),
  coordinates: DeliveryMemberCoordinatesV1Schema.nullable(),
});

/** Mutable delivery execution state persisted separately from authored plan intent. */
export const DeliveryStateV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("delivery-state/v1"),
  planId: DeliveryPlanIdSchema,
  workUnitId: SlugSchema,
  boundPlan: z.strictObject({
    planRevision: PositiveSafeIntegerSchema,
    planDigest: DeliveryCanonicalDigestSchema,
  }),
  target: z.strictObject({
    ref: DeliveryOpaqueIdSchema,
    coordinates: DeliveryTargetCoordinatesV1Schema.nullable(),
  }).nullable(),
  members: z.array(DeliveryStateMemberV1Schema).min(1).refine(
    (members) => new Set(members.map((member) => member.deliverableId)).size === members.length,
    "state members must be distinct",
  ),
  activeOperation: DeliveryActiveOperationV1Schema.nullable(),
});
export type DeliveryStateV1 = z.infer<typeof DeliveryStateV1Schema>;

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
  void priorRevision;
  return DeliveryPlanAuthoringInputV1Schema.safeParse(value);
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
      DeliveryCanonicalDigestSchema.parse(deliverableIdForChunkKey(chunkKey))
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
  registry.register(DeliveryStateV1Schema, {
    id: "delivery-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(DeliveryDeliverableIdPreimageSchema, {
    id: "delivery-deliverable-id-preimage",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
