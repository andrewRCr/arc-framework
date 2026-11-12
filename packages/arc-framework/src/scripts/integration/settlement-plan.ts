/** Canonical cross-channel settlement plan for an approved integration checkpoint. */

import { z } from "zod";

import { canonicalize, sortByCanonicalBytes } from "../../lib/kernel/canonical/canonical-json.js";
import { DeliveryReviewMemberVehicleSchema } from "../../lib/delivery/review-vehicle.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { CanonicalDigestSchema } from "../../lib/kernel/schema/vocabulary.js";
import { ReviewIdentifierSchema } from "../review-gate/core/gate-contract-v2-schema.js";
import { ReviewResponseSettlementActionSchema } from "../review-gate/core/response-plan-schema.js";
import {
  HostedSettleEnvelopeSchema,
  type HostedSettleEnvelope,
} from "../review-gate/hosted/settle.js";

const DigestSchema = CanonicalDigestSchema;

export const HostedSettlementActionSchema = z.strictObject({
  channel: z.literal("hosted"),
  dispositionId: DigestSchema,
  request: HostedSettleEnvelopeSchema,
});
export type HostedSettlementAction = z.infer<typeof HostedSettlementActionSchema>;

/** Recheck an already-completed Candidate-owned private-member fix without replaying it. */
export const CandidateResponseConfirmationActionSchema = z.strictObject({
  channel: z.literal("candidate-response-confirmation"),
  dispositionId: DigestSchema,
  operationId: ReviewIdentifierSchema,
  workUnit: SlugSchema,
  candidateId: DigestSchema,
  responseId: DigestSchema,
  memberTargetId: DigestSchema,
  candidateOriginTargetId: DigestSchema,
  deliveryMember: DeliveryReviewMemberVehicleSchema,
  approvedBase: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u),
}).superRefine((action, context) => {
  if (action.deliveryMember.workUnitId !== action.workUnit) {
    context.addIssue({
      code: "custom",
      path: ["deliveryMember", "workUnitId"],
      message: "must match the Candidate work unit",
    });
  }
});
export type CandidateResponseConfirmationAction = z.infer<typeof CandidateResponseConfirmationActionSchema>;

export const SettlementActionSchema = z.discriminatedUnion("channel", [
  HostedSettlementActionSchema,
  ReviewResponseSettlementActionSchema,
  CandidateResponseConfirmationActionSchema,
]);
export type SettlementAction = z.infer<typeof SettlementActionSchema>;

export const CanonicalSettlementPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("integration-settlement-plan/v1"),
  actions: z.array(SettlementActionSchema),
}).superRefine((plan, context) => {
  const actionBytes = plan.actions.map((action) => canonicalize(action));
  if (new Set(actionBytes).size !== actionBytes.length) {
    context.addIssue({ code: "custom", path: ["actions"], message: "settlement actions must be unique" });
  }
  if (canonicalize(sortByCanonicalBytes(plan.actions)) !== canonicalize(plan.actions)) {
    context.addIssue({ code: "custom", path: ["actions"], message: "settlement actions must be canonical" });
  }
});
export type CanonicalSettlementPlan = z.infer<typeof CanonicalSettlementPlanSchema>;

/** Bind one hosted finding's exact target, actor, thread, disposition, and reply request. */
export function composeHostedSettlementAction(input: {
  dispositionId: string;
  request: HostedSettleEnvelope;
}): HostedSettlementAction {
  return HostedSettlementActionSchema.parse({
    channel: "hosted",
    dispositionId: input.dispositionId,
    request: input.request,
  });
}

/**
 * Pin the existing private-response evidence this checkpoint will re-confirm at settlement.
 *
 * @param input - Exact Candidate and private-member response identities.
 * @returns A validated confirmation action for the canonical settlement plan.
 */
export function composeCandidateResponseConfirmationAction(
  input: Omit<z.input<typeof CandidateResponseConfirmationActionSchema>,
    "channel" | "dispositionId" | "memberTargetId" | "candidateOriginTargetId"> & {
    dispositionId: string;
    memberTargetId: string;
    candidateOriginTargetId: string;
  },
): CandidateResponseConfirmationAction {
  return CandidateResponseConfirmationActionSchema.parse({
    channel: "candidate-response-confirmation",
    ...input,
  });
}

/** Sort and validate settlement actions into their digest-stable representation. */
export function composeCanonicalSettlementPlan(
  actions: readonly SettlementAction[],
): CanonicalSettlementPlan {
  return CanonicalSettlementPlanSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "integration-settlement-plan/v1",
    actions: sortByCanonicalBytes(actions.map((action) => SettlementActionSchema.parse(action))),
  });
}

/** Distinct approved disposition identities represented by the plan. */
export function settlementDispositionIds(plan: CanonicalSettlementPlan): string[] {
  return [...new Set(CanonicalSettlementPlanSchema.parse(plan).actions.map(({ dispositionId }) => dispositionId))]
    .sort();
}

/**
 * Name what a plan settles: every approved disposition set by identity, with its action count per channel.
 *
 * @param plan - The canonical settlement plan an integration checkpoint persists.
 * @returns Approval evidence an owner can check against the stored plan.
 */
export function describeSettlementPlan(plan: CanonicalSettlementPlan): string {
  const channelsById = new Map<string, Map<SettlementAction["channel"], number>>();
  for (const { dispositionId, channel } of CanonicalSettlementPlanSchema.parse(plan).actions) {
    const channels = channelsById.get(dispositionId) ?? new Map<SettlementAction["channel"], number>();
    channels.set(channel, (channels.get(channel) ?? 0) + 1);
    channelsById.set(dispositionId, channels);
  }
  if (channelsById.size === 0) return "No approved dispositions require settlement.";
  const byKey = <T>([left]: [string, T], [right]: [string, T]): number => left < right ? -1 : left > right ? 1 : 0;
  const sets = [...channelsById.entries()].sort(byKey).map(([dispositionId, channels]) => {
    const counts = [...channels.entries()].sort(byKey)
      .map(([channel, count]) => `${count} ${channel} action${count === 1 ? "" : "s"}`);
    return `${dispositionId} (${counts.join(", ")})`;
  });
  return `${sets.length} approved disposition set(s) require settlement: ${sets.join("; ")}.`;
}
