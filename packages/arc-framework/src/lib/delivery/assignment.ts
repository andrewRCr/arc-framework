/** Canonical assignment record for delivery-owned materialization decisions. */

import { z } from "zod";

import { canonicalize, SlugSchema } from "../kernel/index.js";
import { deriveMemberAssuranceSubjectId } from "./identity.js";
import type { DeliveryPayloadCodec } from "./ports.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryOpaqueIdSchema,
  DeliveryPlanIdSchema,
} from "./schema.js";

const PositiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const GitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const BindingSchema = z.record(z.string(), z.json());

/** One provider-owned change-request handle selected by delivery. */
export const DeliveryChangeRequestHandleV1Schema = z.strictObject({
  providerId: DeliveryOpaqueIdSchema,
  changeRequestId: DeliveryOpaqueIdSchema,
});

/** One live member materialization and its delivery-owned decisions. */
export const DeliveryMemberAssignmentV1Schema = z.strictObject({
  deliverableId: DeliveryCanonicalDigestSchema,
  assuranceSubjectId: DeliveryCanonicalDigestSchema,
  ref: DeliveryOpaqueIdSchema,
  assignedHeadObjectId: GitObjectIdSchema,
  changeRequestHandles: z.array(DeliveryChangeRequestHandleV1Schema),
  materializationGeneration: PositiveSafeIntegerSchema,
  reviewRouting: z.strictObject({
    routeId: DeliveryOpaqueIdSchema,
    binding: BindingSchema,
  }),
});
export type DeliveryMemberAssignmentV1 = z.infer<typeof DeliveryMemberAssignmentV1Schema>;

/** Runtime assignment record boundary. */
export const DeliveryAssignmentsV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("delivery-assignments/v1"),
  planId: DeliveryPlanIdSchema,
  workUnitId: SlugSchema,
  host: z.strictObject({
    adapterId: DeliveryOpaqueIdSchema,
    providerBinding: BindingSchema,
  }),
  terminalTarget: z.strictObject({
    sourceRef: DeliveryOpaqueIdSchema,
    destinationRef: DeliveryOpaqueIdSchema,
  }),
  members: z.array(DeliveryMemberAssignmentV1Schema),
  generationHighWater: z.array(z.strictObject({
    assuranceSubjectId: DeliveryCanonicalDigestSchema,
    generation: PositiveSafeIntegerSchema,
  })),
}).superRefine((assignments, context) => {
  const deliverableIds = new Set<string>();
  const memberSubjectIds = new Set<string>();
  for (const [index, member] of assignments.members.entries()) {
    if (member.assuranceSubjectId !== deriveMemberAssuranceSubjectId(
      assignments.planId,
      member.deliverableId,
    )) {
      context.addIssue({
        code: "custom",
        message: "member subject must derive from its plan and deliverable",
        path: ["members", index, "assuranceSubjectId"],
      });
    }
    if (deliverableIds.has(member.deliverableId)) {
      context.addIssue({ code: "custom", message: "deliverable assignment must be unique", path: ["members", index] });
    }
    if (memberSubjectIds.has(member.assuranceSubjectId)) {
      context.addIssue({ code: "custom", message: "subject assignment must be unique", path: ["members", index] });
    }
    deliverableIds.add(member.deliverableId);
    memberSubjectIds.add(member.assuranceSubjectId);
  }
  const marks = new Map<string, number>();
  for (const [index, mark] of assignments.generationHighWater.entries()) {
    if (marks.has(mark.assuranceSubjectId)) {
      context.addIssue({
        code: "custom",
        message: "subject high-water mark must be unique",
        path: ["generationHighWater", index],
      });
    }
    marks.set(mark.assuranceSubjectId, mark.generation);
  }
  for (const [index, member] of assignments.members.entries()) {
    if (marks.get(member.assuranceSubjectId) !== member.materializationGeneration) {
      context.addIssue({
        code: "custom",
        message: "live generation must equal its subject high-water mark",
        path: ["members", index, "materializationGeneration"],
      });
    }
  }
});

/** Parsed delivery assignment record. */
export type DeliveryAssignmentsV1 = z.infer<typeof DeliveryAssignmentsV1Schema>;

/** Persisted assignment payload codec. */
export const DeliveryAssignmentsV1Codec: DeliveryPayloadCodec<DeliveryAssignmentsV1> = {
  decode: (value) => {
    const parsed = DeliveryAssignmentsV1Schema.safeParse(value);
    return parsed.success
      ? { status: "decoded", value: parsed.data }
      : { status: "refused" };
  },
  planId: (value) => value.planId,
};

function materializationBinding(
  member: DeliveryMemberAssignmentV1,
  host: DeliveryAssignmentsV1["host"],
  terminalTarget: DeliveryAssignmentsV1["terminalTarget"],
): string {
  return canonicalize({
    host,
    terminalTarget,
    deliverableId: member.deliverableId,
    assuranceSubjectId: member.assuranceSubjectId,
    ref: member.ref,
    assignedHeadObjectId: member.assignedHeadObjectId,
    changeRequestHandles: member.changeRequestHandles,
    reviewRouting: member.reviewRouting,
  });
}

/** Whether a proposed assignment preserves issued generations and advances changed materializations. */
export function isDeliveryAssignmentSuccessor(
  current: DeliveryAssignmentsV1,
  proposed: DeliveryAssignmentsV1,
): boolean {
  const currentMarks = new Map(current.generationHighWater.map((mark) => [
    mark.assuranceSubjectId,
    mark.generation,
  ]));
  const proposedMarks = new Map(proposed.generationHighWater.map((mark) => [
    mark.assuranceSubjectId,
    mark.generation,
  ]));
  for (const [subjectId, generation] of currentMarks) {
    const proposedGeneration = proposedMarks.get(subjectId);
    if (proposedGeneration === undefined || proposedGeneration < generation) return false;
  }

  const currentMembers = new Map(current.members.map((member) => [member.assuranceSubjectId, member]));
  for (const member of proposed.members) {
    const previousMark = currentMarks.get(member.assuranceSubjectId);
    if (previousMark === undefined) continue;
    const previous = currentMembers.get(member.assuranceSubjectId);
    if (previous === undefined
      || materializationBinding(previous, current.host, current.terminalTarget)
        !== materializationBinding(member, proposed.host, proposed.terminalTarget)) {
      if (member.materializationGeneration <= previousMark) return false;
    } else if (member.materializationGeneration !== previous.materializationGeneration) {
      return false;
    }
  }
  return true;
}
