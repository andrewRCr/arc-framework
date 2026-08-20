/** Canonical cross-channel settlement plan for an approved integration checkpoint. */

import { z } from "zod";

import { canonicalize, sortByCanonicalBytes } from "../../lib/canonical/canonical-json.js";
import { ReviewResponseSettlementActionSchema } from "../review-gate/core/response-plan-schema.js";
import {
  HostedSettleEnvelopeSchema,
  type HostedSettleEnvelope,
} from "../review-gate/hosted/settle.js";

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const HostedSettlementActionSchema = z.strictObject({
  channel: z.literal("hosted"),
  dispositionId: DigestSchema,
  request: HostedSettleEnvelopeSchema,
});
export type HostedSettlementAction = z.infer<typeof HostedSettlementActionSchema>;

export const SettlementActionSchema = z.discriminatedUnion("channel", [
  HostedSettlementActionSchema,
  ReviewResponseSettlementActionSchema,
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
