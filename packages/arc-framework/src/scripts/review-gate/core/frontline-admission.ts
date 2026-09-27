/** Native admission identity for one durable frontline producer attempt. */

import { z } from "zod";

import { canonicalDigest } from "../../../lib/kernel/index.js";
import { FrontlineSemanticRecordSchema } from "../policy/frontline-semantic.js";
import { ReviewRoutingProjectionSchema } from "../policy/routing-schema.js";
import {
  ReviewCanonicalDigestSchema,
  ReviewTargetSchema,
  type ReviewTarget,
} from "./gate-contract-v2-schema.js";
import { LaneSubjectLineageSchema, laneSubjectLineageId } from "./lane-admission.js";
import { ReviewPassSchema } from "./review-pass.js";

const FrontlineAdmissionShape = {
  schemaVersion: z.literal(1),
  operationId: ReviewCanonicalDigestSchema,
  lineage: LaneSubjectLineageSchema,
  target: ReviewTargetSchema,
  routing: ReviewRoutingProjectionSchema,
  frontlineReview: FrontlineSemanticRecordSchema,
  logicalPass: ReviewPassSchema,
  retryGeneration: z.number().int().nonnegative(),
  maxPasses: ReviewPassSchema,
  policyVersion: ReviewCanonicalDigestSchema,
  requestedCoverage: z.literal("complete"),
} as const;

export const FrontlineAdmissionSchema = z.strictObject(FrontlineAdmissionShape).superRefine(
  (admission, context) => {
    if (admission.frontlineReview.action !== "attempt" || admission.frontlineReview.source === null) {
      context.addIssue({
        code: "custom",
        path: ["frontlineReview"],
        message: "frontline admission requires one executable source",
      });
      return;
    }
    if (admission.logicalPass > admission.maxPasses) {
      context.addIssue({
        code: "custom",
        path: ["logicalPass"],
        message: "frontline admission exceeds its pass allowance",
      });
    }
    if (admission.maxPasses !== admission.frontlineReview.maxPasses) {
      context.addIssue({
        code: "custom",
        path: ["maxPasses"],
        message: "frontline admission allowance must match its semantic record",
      });
    }
    if (admission.policyVersion !== canonicalDigest({
      routing: admission.routing,
      frontlineReview: admission.frontlineReview,
    })) {
      context.addIssue({
        code: "custom",
        path: ["policyVersion"],
        message: "frontline admission policy digest must match its admitted policy",
      });
    }
    if (admission.operationId !== frontlineAdmissionOperationId({
      target: admission.target,
      lineage: admission.lineage,
      sourceId: admission.frontlineReview.source.sourceId,
      logicalPass: admission.logicalPass,
      retryGeneration: admission.retryGeneration,
    })) {
      context.addIssue({
        code: "custom",
        path: ["operationId"],
        message: "frontline admission operation must match its admitted producer",
      });
    }
  },
);
export type FrontlineAdmission = z.infer<typeof FrontlineAdmissionSchema>;

/**
 * Derive the source-native operation identity for one admitted frontline attempt.
 *
 * @param input - Exact target, lineage, source, pass, and retry-generation identity.
 * @returns The canonical operation digest for that admitted producer.
 */
export function frontlineAdmissionOperationId(input: {
  target: ReviewTarget;
  lineage: FrontlineAdmission["lineage"];
  sourceId: string;
  logicalPass: number;
  retryGeneration: number;
}): `sha256:${string}` {
  return canonicalDigest({
    domain: "arc.review-gate.frontline-operation/v1",
    targetId: ReviewTargetSchema.parse(input.target).targetId,
    lineageId: laneSubjectLineageId(input.lineage),
    sourceIdentity: input.sourceId,
    logicalPass: ReviewPassSchema.parse(input.logicalPass),
    retryGeneration: z.number().int().nonnegative().parse(input.retryGeneration),
  });
}

/**
 * Compose and validate the immutable ready inputs admitted for one frontline attempt.
 *
 * @param input - Runtime-resolved lineage, target, policy, source, and pass inputs.
 * @returns The complete immutable frontline admission.
 */
export function createFrontlineAdmission(
  input: Omit<z.input<typeof FrontlineAdmissionSchema>, "schemaVersion" | "operationId" | "policyVersion"
    | "requestedCoverage">,
): FrontlineAdmission {
  const lineage = LaneSubjectLineageSchema.parse(input.lineage);
  const target = ReviewTargetSchema.parse(input.target);
  const routing = ReviewRoutingProjectionSchema.parse(input.routing);
  const frontlineReview = FrontlineSemanticRecordSchema.parse(input.frontlineReview);
  const logicalPass = ReviewPassSchema.parse(input.logicalPass);
  const retryGeneration = z.number().int().nonnegative().parse(input.retryGeneration);
  const maxPasses = ReviewPassSchema.parse(input.maxPasses);
  if (frontlineReview.source === null) {
    throw new Error("frontline admission requires one executable source");
  }
  const policyVersion = canonicalDigest({
    routing,
    frontlineReview,
  });
  return FrontlineAdmissionSchema.parse({
    schemaVersion: 1,
    lineage,
    target,
    routing,
    frontlineReview,
    logicalPass,
    retryGeneration,
    maxPasses,
    operationId: frontlineAdmissionOperationId({
      target,
      lineage,
      sourceId: frontlineReview.source.sourceId,
      logicalPass,
      retryGeneration,
    }),
    policyVersion,
    requestedCoverage: "complete",
  });
}
