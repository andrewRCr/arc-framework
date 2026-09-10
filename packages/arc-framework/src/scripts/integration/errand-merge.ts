/** Exact-effect Errand terminal merge contracts and operation. */

import { z } from "zod";

import { BoundedEvidenceResidualSchema } from "../../lib/evidence-applicability/index.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { LocusTokenSchema } from "../../lib/locus/schema/index.js";
import { RequiredCheckSchema } from "../review-gate/checks-await.js";
import { IntegrationMergeTargetSchema } from "./merge.js";
import { SpineRemedySchema } from "./spine-refusal.js";

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ErrandMergeIdentitySchema = z.strictObject({
  slug: SlugSchema,
  claimId: LocusTokenSchema,
  branch: z.string().trim().min(1),
  generation: z.string().regex(/^errand-v1\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-f0-9]{32}$/u),
}).superRefine((identity, context) => {
  if (identity.generation !== `errand-v1/${identity.slug}/${identity.claimId}`) {
    context.addIssue({
      code: "custom",
      path: ["generation"],
      message: "Errand generation must match the approved slug and claim",
    });
  }
});

/** Strict input for one approved Errand merge effect. */
export const ErrandMergeRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  identity: ErrandMergeIdentitySchema,
  approvedTarget: IntegrationMergeTargetSchema,
  lane: z.enum(["auto", "reviewed"]),
  mergeMethod: z.strictObject({
    method: z.enum(["merge", "rebase", "squash"]),
    policyFingerprint: DigestSchema,
  }),
}).superRefine((request, context) => {
  if (request.identity.branch !== request.approvedTarget.headRef) {
    context.addIssue({
      code: "custom",
      path: ["approvedTarget", "headRef"],
      message: "Approved target must name the current Errand branch",
    });
  }
});
export type ErrandMergeRequest = z.infer<typeof ErrandMergeRequestSchema>;

const resultCommon = {
  schemaVersion: z.literal(1),
  mode: z.literal("errand-merge"),
  identity: ErrandMergeIdentitySchema,
  approvedTarget: IntegrationMergeTargetSchema,
  lane: z.enum(["auto", "reviewed"]),
};
const DetailSchema = z.string().trim().min(1).max(4_096);
const coordinates = z.strictObject({
  observedTarget: IntegrationMergeTargetSchema.nullable(),
  observedBaseOid: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u).nullable(),
});
const continuation = z.union([
  z.strictObject({ kind: z.literal("remedy"), remedy: SpineRemedySchema }),
  z.strictObject({ kind: z.literal("terminal-explanation"), terminalExplanation: DetailSchema }),
]);
const nonSuccess = {
  ...resultCommon,
  detail: DetailSchema,
  coordinates,
  continuation,
};

/** Closed result for one Errand terminal merge attempt. */
export const ErrandMergeResultSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...resultCommon,
    state: z.literal("merged"),
    nextAction: z.literal("complete"),
    providerMergeId: z.string().trim().min(1).nullable(),
  }),
  z.strictObject({
    ...nonSuccess,
    state: z.literal("awaiting-checks"),
    nextAction: z.literal("retry"),
    reason: z.enum(["checks-pending", "checks-unavailable"]),
    checks: z.array(RequiredCheckSchema),
    diagnosticFailures: z.array(RequiredCheckSchema),
  }),
  z.strictObject({
    ...nonSuccess,
    state: z.literal("applicability-judgment-required"),
    nextAction: z.literal("assess-applicability"),
    reason: z.literal("bounded-review-residual"),
    applicability: z.strictObject({
      verdict: z.literal("supplemental"),
      residual: BoundedEvidenceResidualSchema,
      reason: z.enum(["bounded-overlap", "bounded-clean-divergence"]),
      judgmentRequired: z.literal(true),
    }),
  }),
  z.strictObject({
    ...nonSuccess,
    state: z.literal("reconcile-base"),
    nextAction: z.literal("reconcile-base"),
    reason: z.literal("base-reconcile-required"),
  }),
  z.strictObject({
    ...nonSuccess,
    state: z.literal("reconcile-regenerable"),
    nextAction: z.literal("reconcile-regenerable"),
    reason: z.literal("regenerable-reconcile-required"),
  }),
  z.strictObject({
    ...nonSuccess,
    state: z.literal("conflict"),
    nextAction: z.literal("stop"),
    reason: z.enum(["substantive-conflict", "unsafe-reconcile"]),
    paths: z.array(z.string().trim().min(1)),
  }),
  z.strictObject({
    ...nonSuccess,
    state: z.literal("host-pending"),
    nextAction: z.literal("retry"),
    reason: z.literal("host-admission-unresolved"),
  }),
  z.strictObject({
    ...nonSuccess,
    state: z.literal("host-refused"),
    nextAction: z.literal("stop"),
    reason: z.literal("host-refused"),
  }),
  z.strictObject({
    ...nonSuccess,
    state: z.literal("invalidated"),
    nextAction: z.literal("request-approval"),
    reason: z.enum([
      "identity-moved",
      "target-moved",
      "merge-method-moved",
      "review-applicability-fresh",
    ]),
  }),
  z.strictObject({
    ...nonSuccess,
    state: z.literal("merge-outcome-unknown"),
    nextAction: z.literal("retry"),
    reason: z.literal("mutation-outcome-unknown"),
    mutationDetail: DetailSchema,
    confirmationDetail: DetailSchema,
  }),
  z.strictObject({
    ...nonSuccess,
    state: z.literal("operation-failed"),
    nextAction: z.enum(["retry", "stop"]),
    reason: z.enum([
      "identity-observation-failed",
      "drift-observation-failed",
      "merge-method-resolution-failed",
      "lock-operation-failed",
      "provider-operation-failed",
    ]),
  }),
]);
export type ErrandMergeResult = z.infer<typeof ErrandMergeResultSchema>;

/** Compare a fresh Errand identity and target with one approved merge request. */
export function validateErrandMergeBinding(
  requestInput: ErrandMergeRequest,
  observed: {
    readonly identity: ErrandMergeRequest["identity"];
    readonly target: ErrandMergeRequest["approvedTarget"];
    readonly baseOid: string | null;
  },
): Extract<ErrandMergeResult, { state: "invalidated" }> | null {
  const request = ErrandMergeRequestSchema.parse(requestInput);
  const identityMatches = observed.identity.slug === request.identity.slug
    && observed.identity.claimId === request.identity.claimId
    && observed.identity.branch === request.identity.branch
    && observed.identity.generation === request.identity.generation;
  const targetMatches = observed.target.repository.toLowerCase()
      === request.approvedTarget.repository.toLowerCase()
    && observed.target.pullRequest === request.approvedTarget.pullRequest
    && observed.target.baseRef === request.approvedTarget.baseRef
    && observed.target.headRef === request.approvedTarget.headRef
    && observed.target.headSha === request.approvedTarget.headSha;
  const reason = !identityMatches ? "identity-moved" as const
    : !targetMatches ? "target-moved" as const
      : null;
  if (reason === null) return null;
  const detail = reason === "identity-moved"
    ? "The current Errand identity no longer matches the approved generation."
    : "The current change-request target no longer matches the approved target.";
  const result = ErrandMergeResultSchema.parse({
    schemaVersion: 1,
    mode: "errand-merge",
    state: "invalidated",
    nextAction: "request-approval",
    reason,
    detail,
    identity: request.identity,
    approvedTarget: request.approvedTarget,
    lane: request.lane,
    coordinates: {
      observedTarget: observed.target,
      observedBaseOid: observed.baseOid,
    },
    continuation: {
      kind: "terminal-explanation",
      terminalExplanation: "Recompose the exact Errand merge request and obtain fresh approval.",
    },
  });
  if (result.state !== "invalidated") throw new Error("Invalid Errand merge invalidation projection.");
  return result;
}
