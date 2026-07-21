/** Runtime schemas for channel-neutral review-response planning. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { DispositionApprovalSchema, DispositionSetSchema } from "./disposition-records.js";
import { NormalizedReviewFindingSchema } from "./finding-records.js";
import { ReviewTargetSchema } from "./gate-contract-v2-schema.js";
import { ReviewRoutingDecisionSchema } from "../policy/routing-schema.js";

export const ReviewResponseCapabilitySchema = z.enum(["approve", "fix", "persist", "close", "reroute"]);
export type ReviewResponseCapability = z.infer<typeof ReviewResponseCapabilitySchema>;

export const ReviewResponseCapabilitiesSchema = z.strictObject({
  approve: z.boolean(),
  fix: z.boolean(),
  persist: z.boolean(),
  close: z.boolean(),
  reroute: z.boolean(),
});
export type ReviewResponseCapabilities = z.infer<typeof ReviewResponseCapabilitiesSchema>;

const AdapterHandleSchema = z.string().trim().min(1).max(1024);
const FindingAdapterShape = {
  findingId: z.string().trim().min(1).max(512),
  immutableLocus: z.string().trim().min(1).max(2048),
};

export const ReviewConversationCapabilitySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("controller-finding"),
    ...FindingAdapterShape,
    receiptHandle: AdapterHandleSchema,
    replyHandle: AdapterHandleSchema.nullable(),
    threadStateHandle: AdapterHandleSchema.nullable(),
    canReply: z.boolean(),
    canResolve: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("provider-native"),
    ...FindingAdapterShape,
    providerReplyHandle: AdapterHandleSchema.nullable(),
    threadStateHandle: AdapterHandleSchema,
    decisiveReviewHandle: AdapterHandleSchema,
    canReply: z.boolean(),
  }),
]).superRefine((capability, context) => {
  if (capability.kind === "controller-finding") {
    if (capability.canReply && capability.replyHandle === null) {
      context.addIssue({ code: "custom", message: "reply capability requires an authoritative reply handle" });
    }
    if (capability.canResolve && capability.threadStateHandle === null) {
      context.addIssue({ code: "custom", message: "resolution capability requires a thread-state handle" });
    }
  } else if (capability.canReply && capability.providerReplyHandle === null) {
    context.addIssue({ code: "custom", message: "provider reply capability requires an authoritative handle" });
  }
});
export type ReviewConversationCapability = z.infer<typeof ReviewConversationCapabilitySchema>;

export const ReviewResponseInputSchema = z.strictObject({
  currentTarget: ReviewTargetSchema,
  findings: z.array(NormalizedReviewFindingSchema).min(1),
  routing: ReviewRoutingDecisionSchema,
  dispositionSet: DispositionSetSchema.nullable(),
  approval: DispositionApprovalSchema.nullable(),
  candidateTarget: ReviewTargetSchema.nullable(),
  persistedTargetId: z.string().regex(/^sha256:[0-9a-f]{64}$/u).nullable(),
  verificationPassed: z.boolean(),
  verificationRefs: z.array(z.string().trim().min(1)),
  capabilities: ReviewResponseCapabilitiesSchema,
  channel: z.enum(["local", "hosted"]),
  conversations: z.array(ReviewConversationCapabilitySchema),
}).superRefine((input, context) => {
  if (input.channel === "local" && input.conversations.length > 0) {
    context.addIssue({ code: "custom", message: "local review has no conversation action surface" });
  }
  const findings = new Map(input.findings.map((finding) => [finding.findingId, finding]));
  const conversationIds = new Set<string>();
  for (const [index, conversation] of input.conversations.entries()) {
    const finding = findings.get(conversation.findingId);
    if (finding === undefined) {
      context.addIssue({ code: "custom", message: "conversation names an unknown finding", path: ["conversations", index] });
    } else if (finding.locus !== conversation.immutableLocus) {
      context.addIssue({ code: "custom", message: "conversation immutable locus does not match finding", path: ["conversations", index] });
    }
    if (conversationIds.has(conversation.findingId)) {
      context.addIssue({ code: "custom", message: "duplicate conversation finding", path: ["conversations", index] });
    }
    conversationIds.add(conversation.findingId);
  }
});
export type ReviewResponseInput = z.infer<typeof ReviewResponseInputSchema>;

export const ReviewResponseStateSchema = z.enum([
  "awaiting-approval",
  "ready-to-fix",
  "ready-to-persist",
  "ready-to-close",
  "reroute",
  "blocked",
]);
export type ReviewResponseState = z.infer<typeof ReviewResponseStateSchema>;

export const ReviewResponsePlanSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-response/v1"),
  state: ReviewResponseStateSchema,
  oldTarget: ReviewTargetSchema,
  newTarget: ReviewTargetSchema.nullable(),
  approvedDispositionSet: DispositionSetSchema.nullable(),
  verificationRefs: z.array(z.string().trim().min(1)),
  blocking: z.boolean(),
  allowedCapabilities: z.array(ReviewResponseCapabilitySchema),
  channelActions: z.array(z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("controller-finding"),
      findingId: z.string().trim().min(1).max(512),
      receiptHandle: AdapterHandleSchema,
      replyHandle: AdapterHandleSchema.nullable(),
      threadStateHandle: AdapterHandleSchema.nullable(),
      reply: z.boolean(),
      resolve: z.boolean(),
    }),
    z.strictObject({
      kind: z.literal("provider-native"),
      findingId: z.string().trim().min(1).max(512),
      providerReplyHandle: AdapterHandleSchema.nullable(),
      threadStateHandle: AdapterHandleSchema,
      decisiveReviewHandle: AdapterHandleSchema,
      reply: z.boolean(),
    }),
  ])),
  nextAction: z.string().trim().min(1),
});
export type ReviewResponsePlan = z.infer<typeof ReviewResponsePlanSchema>;

/** Register deterministic response-planning records with the review domain. */
export function registerReviewResponseSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewResponseInputSchema, {
    id: "review-response-input",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewResponsePlanSchema, {
    id: "review-response-plan",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
