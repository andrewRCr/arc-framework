/** Strict normalized evidence-applicability contracts. */

import { z } from "zod";

import { DeliveryContributionEndpointsSchema, DeliveryContributionProofResultSchema } from
  "../delivery/contribution-proof.js";
import { isManagedPath } from "../kernel/canonical/managed-path.js";
import {
  CandidateLineageTargetSchema,
  CandidateSubjectDeltaSchema,
  CandidateVerificationApplicabilitySchema,
} from "../work-unit/candidate-evidence.js";

export const MAX_EVIDENCE_APPLICABILITY_PATHS = 200;
export const MAX_EVIDENCE_APPLICABILITY_PATH_BYTES = 16_384;

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const EvidencePathSchema = z.string().min(1)
  .refine((value): boolean => isManagedPath(value), "must be a managed repository path");

/** Compare evidence paths by their repository-facing UTF-8 bytes. */
export function compareEvidencePaths(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function canonicalPathArray(minimum: number) {
  return z.array(EvidencePathSchema).min(minimum).superRefine((paths, context) => {
    let previous: string | undefined;
    if (paths.some((path) => {
      const invalid = previous !== undefined && compareEvidencePaths(previous, path) >= 0;
      previous = path;
      return invalid;
    })) {
      context.addIssue({ code: "custom", message: "path evidence must be sorted and unique" });
    }
  });
}

export const BoundedEvidenceResidualSchema = canonicalPathArray(1)
  .max(MAX_EVIDENCE_APPLICABILITY_PATHS)
  .superRefine((paths, context) => {
    if (new TextEncoder().encode(paths.join("\0")).byteLength > MAX_EVIDENCE_APPLICABILITY_PATH_BYTES) {
      context.addIssue({ code: "custom", message: "path evidence exceeds the byte bound" });
    }
  });
export type BoundedEvidenceResidual = z.infer<typeof BoundedEvidenceResidualSchema>;

export const IntegrationCoordinateSchema = z.strictObject({
  repository: z.string().trim().min(1),
  changeRequest: z.number().int().positive(),
  base: ObjectIdSchema,
  head: ObjectIdSchema,
});
export type IntegrationCoordinate = z.infer<typeof IntegrationCoordinateSchema>;

/** Compare every authority-bearing field in two integration coordinates. */
export function integrationCoordinatesEqual(
  left: IntegrationCoordinate,
  right: IntegrationCoordinate,
): boolean {
  return left.repository === right.repository
    && left.changeRequest === right.changeRequest
    && left.base === right.base
    && left.head === right.head;
}

function baseMergeCoordinatesContinuous(
  before: IntegrationCoordinate,
  after: IntegrationCoordinate,
): boolean {
  return before.repository === after.repository
    && before.changeRequest === after.changeRequest
    && before.head === after.head;
}

function pathEvidenceBucketsAreDisjoint(input: {
  substantivePaths: readonly string[];
  regenerablePaths: readonly string[];
}): boolean {
  const substantivePaths = new Set(input.substantivePaths);
  return input.regenerablePaths.every((path) => !substantivePaths.has(path));
}

export const EvidenceOverlapObservationSchema = z.union([
  z.strictObject({
    status: z.literal("available"),
    substantivePaths: z.array(EvidencePathSchema),
    regenerablePaths: z.array(EvidencePathSchema),
  }).refine(pathEvidenceBucketsAreDisjoint, {
    message: "substantive and regenerable path evidence must be disjoint",
    path: ["regenerablePaths"],
  }),
  z.strictObject({ status: z.literal("ambiguous") }),
  z.strictObject({ status: z.literal("unrelated") }),
  z.strictObject({
    status: z.literal("unavailable"),
    reason: z.enum([
      "merge-base-failed",
      "branch-diff-failed",
      "base-diff-failed",
      "classification-failed",
    ]),
  }),
]);
export type EvidenceOverlapObservation = z.infer<typeof EvidenceOverlapObservationSchema>;

export const BaseMovementObservationSchema = z.strictObject({
  coordinates: IntegrationCoordinateSchema,
  overlap: EvidenceOverlapObservationSchema,
});
export type BaseMovementObservation = z.infer<typeof BaseMovementObservationSchema>;

const HostAdmissionCommon = {
  coordinates: IntegrationCoordinateSchema,
  evidenceRef: z.string().trim().min(1).nullable().optional(),
};
export const HostMergeAdmissionSchema = z.union([
  z.strictObject({ state: z.literal("mergeable"), ...HostAdmissionCommon }),
  z.strictObject({
    state: z.literal("base-currentness-required"),
    ...HostAdmissionCommon,
    detail: z.string().trim().min(1),
  }),
  z.strictObject({
    state: z.literal("refused"),
    ...HostAdmissionCommon,
    detail: z.string().trim().min(1),
  }),
  z.strictObject({
    state: z.literal("unresolved"),
    ...HostAdmissionCommon,
    detail: z.string().trim().min(1),
  }),
]);
export type HostMergeAdmission = z.infer<typeof HostMergeAdmissionSchema>;

const BaseMovementProducerSchema = z.strictObject({
  cause: z.literal("base-movement"),
  observation: BaseMovementObservationSchema,
  hostAdmission: HostMergeAdmissionSchema.optional(),
});

const BaseMergeProducerSchema = z.strictObject({
  cause: z.literal("base-merge"),
  before: IntegrationCoordinateSchema,
  after: IntegrationCoordinateSchema,
  overlap: EvidenceOverlapObservationSchema,
  hostAdmission: HostMergeAdmissionSchema.optional(),
  projection: z.strictObject({
    endpoints: DeliveryContributionEndpointsSchema,
    proof: DeliveryContributionProofResultSchema,
  }).optional(),
}).superRefine((value, context) => {
  if (!baseMergeCoordinatesContinuous(value.before, value.after)) {
    context.addIssue({
      code: "custom",
      message: "base-merge observations must retain repository, change request, and head coordinates",
    });
  }
});

const MemberRewriteProducerSchema = z.strictObject({
  cause: z.literal("member-rewrite"),
  endpoints: DeliveryContributionEndpointsSchema,
  proof: DeliveryContributionProofResultSchema,
});

const ApprovedFixResponseSchema = z.strictObject({
  candidateId: DigestSchema,
  dispositionId: DigestSchema,
  oldTarget: CandidateLineageTargetSchema,
  newTarget: CandidateLineageTargetSchema,
  applicability: CandidateVerificationApplicabilitySchema.optional(),
  approvedVerification: CandidateVerificationApplicabilitySchema.optional(),
});

const ApprovedFixProducerSchema = z.strictObject({
  cause: z.literal("approved-fix"),
  response: ApprovedFixResponseSchema,
  delta: CandidateSubjectDeltaSchema,
});

const UnexplainedProducerSchema = z.strictObject({
  cause: z.literal("unexplained"),
  candidateId: DigestSchema,
  priorTarget: CandidateLineageTargetSchema,
  currentTarget: CandidateLineageTargetSchema,
  delta: CandidateSubjectDeltaSchema,
});

export const EvidenceDeltaProducerSchema = z.union([
  BaseMovementProducerSchema,
  BaseMergeProducerSchema,
  MemberRewriteProducerSchema,
  ApprovedFixProducerSchema,
  UnexplainedProducerSchema,
]);
export type EvidenceDeltaProducer = z.infer<typeof EvidenceDeltaProducerSchema>;

export const EvidenceRelationSchema = z.enum([
  "equal",
  "mechanical-reapply",
  "clean-divergence",
  "interaction",
  "unavailable",
  "not-applicable",
]);
export type EvidenceRelation = z.infer<typeof EvidenceRelationSchema>;

const CanonicalPathsSchema = canonicalPathArray(0);
const EmptyPathsSchema = z.tuple([]);
const DisjointOverlapSchema = z.strictObject({
    kind: z.literal("disjoint"),
    substantivePaths: EmptyPathsSchema,
    regenerablePaths: CanonicalPathsSchema,
  });
const OverlappingOverlapSchema = z.strictObject({
    kind: z.literal("overlapping"),
    substantivePaths: canonicalPathArray(1),
    regenerablePaths: CanonicalPathsSchema,
  }).refine(pathEvidenceBucketsAreDisjoint, {
    message: "substantive and regenerable path evidence must be disjoint",
    path: ["regenerablePaths"],
  });
const UnknownOverlapSchema = z.strictObject({
    kind: z.literal("unknown"),
    cause: z.enum(["read-failed", "ambiguous", "unrelated"]),
    substantivePaths: EmptyPathsSchema,
    regenerablePaths: EmptyPathsSchema,
  });
const NotApplicableOverlapSchema = z.strictObject({
    kind: z.literal("not-applicable"),
    substantivePaths: EmptyPathsSchema,
    regenerablePaths: EmptyPathsSchema,
  });
const ApplicableOverlapSchema = z.union([
  DisjointOverlapSchema,
  OverlappingOverlapSchema,
  UnknownOverlapSchema,
]);
export const EvidenceOverlapSchema = z.union([
  DisjointOverlapSchema,
  OverlappingOverlapSchema,
  UnknownOverlapSchema,
  NotApplicableOverlapSchema,
]);
export type EvidenceOverlap = z.infer<typeof EvidenceOverlapSchema>;

const NormalizedHostAdmissionSchema = z.union([
  z.strictObject({
    state: z.literal("mergeable"),
    coordinates: IntegrationCoordinateSchema,
    evidenceRef: z.string().trim().min(1).nullable(),
    detail: z.null(),
  }),
  z.strictObject({
    state: z.enum(["base-currentness-required", "refused"]),
    coordinates: IntegrationCoordinateSchema,
    evidenceRef: z.string().trim().min(1).nullable(),
    detail: z.string().trim().min(1),
  }),
  z.strictObject({
    state: z.literal("unresolved"),
    coordinates: IntegrationCoordinateSchema.nullable(),
    evidenceRef: z.string().trim().min(1).nullable(),
    detail: z.string().trim().min(1),
  }),
  z.strictObject({
    state: z.literal("not-applicable"),
    coordinates: z.null(),
    evidenceRef: z.null(),
    detail: z.null(),
  }),
]);
export type NormalizedHostAdmission = z.infer<typeof NormalizedHostAdmissionSchema>;

const NotApplicableHostAdmissionSchema = z.strictObject({
  state: z.literal("not-applicable"),
  coordinates: z.null(),
  evidenceRef: z.null(),
  detail: z.null(),
});
const ApplicableRelationSchema = z.enum([
  "equal",
  "mechanical-reapply",
  "clean-divergence",
  "interaction",
  "unavailable",
]);
const ResidualSchema = BoundedEvidenceResidualSchema.nullable();

function carriedRelationHasNoResidual(
  relation: EvidenceRelation,
  residual: readonly string[] | null,
): boolean {
  return relation !== "equal" && relation !== "mechanical-reapply"
    || residual === null;
}

function baseMovementResidualMatchesOverlap(
  overlap: EvidenceOverlap,
  residual: readonly string[] | null,
): boolean {
  if (overlap.kind !== "overlapping") return residual === null;
  const bounded = BoundedEvidenceResidualSchema.safeParse(overlap.substantivePaths);
  if (!bounded.success) return residual === null;
  return residual !== null
    && residual.length === bounded.data.length
    && residual.every((path, index) => path === bounded.data[index]);
}

const BaseMovementDeltaSchema = z.strictObject({
  cause: z.literal("base-movement"),
  relation: z.literal("not-applicable"),
  overlap: ApplicableOverlapSchema,
  hostAdmission: NormalizedHostAdmissionSchema,
  approvedScope: z.literal("not-applicable"),
  observed: z.strictObject({
    kind: z.literal("base-movement"),
    coordinates: IntegrationCoordinateSchema,
  }),
  residual: ResidualSchema,
}).superRefine((value, context) => {
  const coordinates = value.hostAdmission.coordinates;
  if (coordinates !== null && !integrationCoordinatesEqual(coordinates, value.observed.coordinates)) {
    context.addIssue({
      code: "custom",
      path: ["hostAdmission", "coordinates"],
      message: "host admission coordinates must match the observed integration coordinates",
    });
  }
  if (!baseMovementResidualMatchesOverlap(value.overlap, value.residual)) {
    context.addIssue({
      code: "custom",
      path: ["residual"],
      message: "base-movement residual must equal the complete bounded substantive overlap",
    });
  }
});
const BaseMergeDeltaSchema = z.strictObject({
  cause: z.literal("base-merge"),
  relation: EvidenceRelationSchema,
  overlap: ApplicableOverlapSchema,
  hostAdmission: NormalizedHostAdmissionSchema,
  approvedScope: z.literal("not-applicable"),
  observed: z.strictObject({
    kind: z.literal("base-merge"),
    before: IntegrationCoordinateSchema,
    after: IntegrationCoordinateSchema,
  }),
  residual: ResidualSchema,
}).superRefine((value, context) => {
  if (!baseMergeCoordinatesContinuous(value.observed.before, value.observed.after)) {
    context.addIssue({
      code: "custom",
      path: ["observed", "after"],
      message: "base-merge observations must retain repository, change request, and head coordinates",
    });
  }
  const coordinates = value.hostAdmission.coordinates;
  if (coordinates !== null && !integrationCoordinatesEqual(coordinates, value.observed.after)) {
    context.addIssue({
      code: "custom",
      path: ["hostAdmission", "coordinates"],
      message: "host admission coordinates must match the observed post-merge coordinates",
    });
  }
  if (!carriedRelationHasNoResidual(value.relation, value.residual)) {
    context.addIssue({
      code: "custom",
      path: ["residual"],
      message: "carried D4 relations cannot retain a divergence residual",
    });
  }
});
const MemberRewriteDeltaSchema = z.strictObject({
  cause: z.literal("member-rewrite"),
  relation: ApplicableRelationSchema,
  overlap: NotApplicableOverlapSchema,
  hostAdmission: NotApplicableHostAdmissionSchema,
  approvedScope: z.literal("not-applicable"),
  observed: z.strictObject({
    kind: z.literal("member-rewrite"),
    endpoints: DeliveryContributionEndpointsSchema,
  }),
  residual: ResidualSchema,
}).superRefine((value, context) => {
  if (!carriedRelationHasNoResidual(value.relation, value.residual)) {
    context.addIssue({
      code: "custom",
      path: ["residual"],
      message: "carried D4 relations cannot retain a divergence residual",
    });
  }
});
const ApprovedFixDeltaSchema = z.strictObject({
  cause: z.literal("approved-fix"),
  relation: z.literal("not-applicable"),
  overlap: NotApplicableOverlapSchema,
  hostAdmission: NotApplicableHostAdmissionSchema,
  approvedScope: CandidateVerificationApplicabilitySchema,
  observed: z.strictObject({
    kind: z.literal("approved-fix"),
    candidateId: DigestSchema,
    dispositionId: DigestSchema,
    oldTarget: CandidateLineageTargetSchema,
    newTarget: CandidateLineageTargetSchema,
  }),
  residual: ResidualSchema,
});
const UnexplainedDeltaSchema = z.strictObject({
  cause: z.literal("unexplained"),
  relation: z.literal("not-applicable"),
  overlap: NotApplicableOverlapSchema,
  hostAdmission: NotApplicableHostAdmissionSchema,
  approvedScope: z.literal("not-applicable"),
  observed: z.strictObject({
    kind: z.literal("unexplained"),
    candidateId: DigestSchema,
    priorTarget: CandidateLineageTargetSchema,
    currentTarget: CandidateLineageTargetSchema,
  }),
  residual: ResidualSchema,
});

export const EvidenceDeltaSchema = z.union([
  BaseMovementDeltaSchema,
  BaseMergeDeltaSchema,
  MemberRewriteDeltaSchema,
  ApprovedFixDeltaSchema,
  UnexplainedDeltaSchema,
]);
export type EvidenceDelta = z.infer<typeof EvidenceDeltaSchema>;
