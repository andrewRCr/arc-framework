/** Exact-effect Errand terminal merge contracts and operation. */

import { z } from "zod";

import {
  BoundedEvidenceResidualSchema,
  EvidenceApplicabilityResultSchema,
  type EvidenceApplicabilityResult,
} from "../../lib/evidence-applicability/index.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { LocusTokenSchema } from "../../lib/locus/schema/index.js";
import {
  RequiredCheckSchema,
  type RequiredChecksObservationResult,
} from "../review-gate/checks-await.js";
import type { MergeMethodResolveResult } from "../review-gate/merge-method.js";
import type { CheckpointMovementObservation, CheckpointMovementPlan } from "./checkpoint.js";
import {
  IntegrationBindingChangedError,
  IntegrationMergeTargetSchema,
  type IntegrationMergeTarget,
  type PinnedMergeResult,
} from "./merge.js";
import { SpineRemedySchema, spineRemedy } from "./spine-refusal.js";

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
    availabilityCause: z.enum(["provider", "aborted", "deadline"]).nullable(),
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
      "base-moved",
      "checks-failed",
      "merge-method-moved",
      "review-applicability-fresh",
    ]),
    /** The reduction that invalidated the request, when one did — it names what a fresh approval must answer. */
    applicability: EvidenceApplicabilityResultSchema.optional(),
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

export type ErrandMergeFinalPlan =
  | {
      readonly status: "available";
      readonly target: IntegrationMergeTarget;
      readonly baseOid: string;
      readonly observation: CheckpointMovementObservation;
      readonly plan: CheckpointMovementPlan;
      readonly reviewApplicability: EvidenceApplicabilityResult;
    }
  | {
      readonly status: "unavailable";
      readonly target: IntegrationMergeTarget | null;
      readonly baseOid: string | null;
      readonly detail: string;
    };

export interface ErrandMergeDependencies {
  readCurrentIdentity(): Promise<ErrandMergeRequest["identity"]>;
  readMerged(target: IntegrationMergeTarget): Promise<{
    merged: boolean;
    providerMergeId: string | null;
  }>;
  refreshTarget(target: IntegrationMergeTarget): Promise<IntegrationMergeTarget>;
  observeChecks(target: IntegrationMergeTarget): Promise<RequiredChecksObservationResult>;
  resolveMergeMethod(repository: string): Promise<MergeMethodResolveResult>;
  readFinalPlan(
    target: IntegrationMergeTarget,
    admissionOverride?: { readonly state: "base-currentness-required" | "refused"; readonly detail: string },
  ): Promise<ErrandMergeFinalPlan>;
  releaseLock(target: IntegrationMergeTarget): Promise<{ state: string }>;
  holdLock(target: IntegrationMergeTarget): Promise<{ state: string }>;
  mergePinned(
    target: IntegrationMergeTarget,
    method: "merge" | "rebase" | "squash",
  ): Promise<PinnedMergeResult>;
}

function exactRetry(
  request: ErrandMergeRequest,
  invariant: string,
  correction: string,
): z.infer<typeof continuation> {
  return {
    kind: "remedy",
    remedy: spineRemedy(
      invariant,
      correction,
      ["arc", "errand", "merge", request.identity.slug, "-", "--json"],
      request,
    ),
  };
}

function failureDetail(error: unknown): string {
  const detail = (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, " ").trim();
  return detail.slice(0, 1_024) || "The operation failed without diagnostic detail.";
}

function mergedResult(
  request: ErrandMergeRequest,
  providerMergeId: string | null,
): ErrandMergeResult {
  return ErrandMergeResultSchema.parse({
    schemaVersion: 1,
    mode: "errand-merge",
    state: "merged",
    nextAction: "complete",
    identity: request.identity,
    approvedTarget: request.approvedTarget,
    lane: request.lane,
    providerMergeId,
  });
}

/**
 * Name the act a base reading needs, when one of the two base-resolution causes produced the invalidation.
 *
 * Both survive a recomposed request untouched: they describe the pair itself, and neither approving the same
 * request again nor reducing over it again alters the pair — so the explanation asking for fresh approval sends
 * the operator around a loop that returns here. The two want opposite acts. Merging the base in collapses a
 * second merge base to one, which is what the append-only reconcile already does; it cannot reach an absent one
 * at all, because Git declines to join unrelated histories unless told to and the reconcile never tells it to.
 *
 * @param applicability - The reduction that invalidated the request, when one did.
 * @param baseOid - The observed base revision, or null when no base observation was established.
 * @param headSha - The approved Errand head a typed reconcile must preserve.
 * @returns The continuation the cause calls for, or null when no base reading decided this invalidation.
 */
function baseResolutionContinuation(
  applicability: EvidenceApplicabilityResult | undefined,
  baseOid: string | null,
  headSha: string,
): z.infer<typeof continuation> | null {
  if (baseOid === null) return null;
  if (applicability?.reason === "overlap-unrelated-base") {
    return {
      kind: "remedy",
      remedy: spineRemedy(
        "Base movement can be proved only between revisions with a common ancestor.",
        "Confirm the Errand is on the base it belongs to, then give the two one common ancestor and compose a "
        + "fresh approved merge request",
        ["git", "merge", "--allow-unrelated-histories", baseOid],
      ),
    };
  }
  if (applicability?.reason !== "overlap-ambiguous-base") return null;
  return {
    kind: "remedy",
    remedy: spineRemedy(
      "A base sharing more than one merge base with the branch proves no single comparison.",
      "Collapse the pair onto one merge base with the typed reconcile, then compose a fresh approved merge "
      + "request",
      ["arc", "base", "merge", "--expected-base", baseOid, "--expected-head", headSha, "--json"],
    ),
  };
}

function invalidatedResult(
  request: ErrandMergeRequest,
  reason: Extract<ErrandMergeResult, { state: "invalidated" }>["reason"],
  detail: string,
  observedTarget: IntegrationMergeTarget | null,
  observedBaseOid: string | null,
  applicability?: EvidenceApplicabilityResult,
): Extract<ErrandMergeResult, { state: "invalidated" }> {
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
    coordinates: { observedTarget, observedBaseOid },
    ...(applicability === undefined ? {} : { applicability }),
    continuation: baseResolutionContinuation(applicability, observedBaseOid, request.approvedTarget.headSha)
      ?? {
        kind: "terminal-explanation",
        terminalExplanation: "Recompose the exact Errand merge request and obtain fresh approval.",
      },
  });
  if (result.state !== "invalidated") throw new Error("Invalid Errand merge invalidation projection.");
  return result;
}

function operationFailedResult(
  request: ErrandMergeRequest,
  reason: Extract<ErrandMergeResult, { state: "operation-failed" }>["reason"],
  detail: string,
  observedTarget: IntegrationMergeTarget | null,
  observedBaseOid: string | null,
  nextAction: "retry" | "stop" = "retry",
): Extract<ErrandMergeResult, { state: "operation-failed" }> {
  const result = ErrandMergeResultSchema.parse({
    schemaVersion: 1,
    mode: "errand-merge",
    state: "operation-failed",
    nextAction,
    reason,
    detail,
    identity: request.identity,
    approvedTarget: request.approvedTarget,
    lane: request.lane,
    coordinates: { observedTarget, observedBaseOid },
    continuation: nextAction === "retry"
      ? exactRetry(
          request,
          "The exact Errand merge attempt remains observable and retryable after an operational failure.",
          "Resolve the reported failure, then retry the exact approved request",
        )
      : {
          kind: "terminal-explanation",
          terminalExplanation: "Resolve the reported operational failure before requesting fresh approval.",
        },
  });
  if (result.state !== "operation-failed") throw new Error("Invalid Errand merge failure projection.");
  return result;
}

function observationFailureResult(
  request: ErrandMergeRequest,
  error: unknown,
  reason: "identity-observation-failed" | "provider-operation-failed",
  target: IntegrationMergeTarget | null,
  baseOid: string | null,
): ErrandMergeResult {
  if (error instanceof IntegrationBindingChangedError) {
    return invalidatedResult(
      request,
      error.binding === "identity" ? "identity-moved" : "target-moved",
      error.message,
      target,
      baseOid,
    );
  }
  return operationFailedResult(request, reason, failureDetail(error), target, baseOid);
}

/** Compose a typed adapter-boundary failure for one otherwise valid exact request. */
export function errandMergeOperationRefusal(
  requestInput: ErrandMergeRequest,
  detail: string,
): ErrandMergeResult {
  const request = ErrandMergeRequestSchema.parse(requestInput);
  return operationFailedResult(
    request,
    "provider-operation-failed",
    detail,
    request.approvedTarget,
    null,
  );
}

function finalPlanIsExact(
  final: Extract<ErrandMergeFinalPlan, { status: "available" }>,
  target: IntegrationMergeTarget,
): boolean {
  return final.target.repository.toLowerCase() === target.repository.toLowerCase()
    && final.target.pullRequest === target.pullRequest
    && final.target.baseRef === target.baseRef
    && final.target.headRef === target.headRef
    && final.target.headSha === target.headSha
    && final.observation.feasibility.base === final.baseOid
    && final.observation.feasibility.head === target.headSha
    && final.observation.admission.repository.toLowerCase() === target.repository.toLowerCase()
    && final.observation.admission.changeRequest === target.pullRequest
    && final.observation.admission.base === final.baseOid
    && final.observation.admission.head === target.headSha;
}

async function withReheldTarget(
  request: ErrandMergeRequest,
  dependencies: ErrandMergeDependencies,
  target: IntegrationMergeTarget,
  baseOid: string | null,
  result: ErrandMergeResult,
): Promise<ErrandMergeResult> {
  try {
    const hold = await dependencies.holdLock(target);
    if (hold.state !== "held" && hold.state !== "no-lock") {
      throw new Error(`Merge-lock hold returned '${hold.state}'.`);
    }
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return operationFailedResult(
      request,
      "lock-operation-failed",
      `The exact target could not be re-held after ${result.state}: ${detail}`,
      target,
      baseOid,
      "stop",
    );
  }
}

function reconcileResult(
  request: ErrandMergeRequest,
  final: Extract<ErrandMergeFinalPlan, { status: "available" }>,
  nextAction: "reconcile-base" | "reconcile-regenerable",
): ErrandMergeResult {
  const regenerable = nextAction === "reconcile-regenerable";
  const argv = [
    "arc", "base", "merge",
    "--expected-base", final.baseOid,
    "--expected-head", request.approvedTarget.headSha,
    ...(regenerable ? ["--regenerate-roadmap"] : []),
  ];
  return ErrandMergeResultSchema.parse({
    schemaVersion: 1,
    mode: "errand-merge",
    state: regenerable ? "reconcile-regenerable" : "reconcile-base",
    nextAction,
    reason: regenerable ? "regenerable-reconcile-required" : "base-reconcile-required",
    detail: regenerable
      ? "The exact plan admits only the determinate regenerable reconcile."
      : "The exact plan requires an ordinary base reconcile.",
    identity: request.identity,
    approvedTarget: request.approvedTarget,
    lane: request.lane,
    coordinates: { observedTarget: final.target, observedBaseOid: final.baseOid },
    continuation: {
      kind: "remedy",
      remedy: spineRemedy(
        "The base reconcile must preserve the exact observed base and approved Errand head.",
        "Apply the typed reconcile, then compose a fresh approved merge request",
        argv,
      ),
    },
  });
}

function applicabilityJudgmentResult(
  request: ErrandMergeRequest,
  final: Extract<ErrandMergeFinalPlan, { status: "available" }>,
): ErrandMergeResult {
  return ErrandMergeResultSchema.parse({
    schemaVersion: 1,
    mode: "errand-merge",
    state: "applicability-judgment-required",
    nextAction: "assess-applicability",
    reason: "bounded-review-residual",
    detail: "Review applicability requires a bounded residual judgment before terminal mutation.",
    identity: request.identity,
    approvedTarget: request.approvedTarget,
    lane: request.lane,
    coordinates: { observedTarget: final.target, observedBaseOid: final.baseOid },
    applicability: final.reviewApplicability,
    continuation: {
      kind: "terminal-explanation",
      terminalExplanation: "Assess the bounded residual and obtain a fresh exact integration approval.",
    },
  });
}

/** Execute one approved direct Errand merge effect. */
export async function mergeErrand(
  requestInput: ErrandMergeRequest,
  dependencies: ErrandMergeDependencies,
): Promise<ErrandMergeResult> {
  const request = ErrandMergeRequestSchema.parse(requestInput);
  let identity: ErrandMergeRequest["identity"];
  try {
    identity = await dependencies.readCurrentIdentity();
  } catch (error) {
    return observationFailureResult(request, error, "identity-observation-failed", null, null);
  }
  const identityInvalidation = validateErrandMergeBinding(request, {
    identity,
    target: request.approvedTarget,
    baseOid: null,
  });
  if (identityInvalidation !== null) return identityInvalidation;
  const existing = await dependencies.readMerged(request.approvedTarget);
  if (existing.merged) {
    return mergedResult(request, existing.providerMergeId);
  }
  let target: IntegrationMergeTarget;
  try {
    target = IntegrationMergeTargetSchema.parse(await dependencies.refreshTarget(request.approvedTarget));
  } catch (error) {
    return observationFailureResult(request, error, "provider-operation-failed", null, null);
  }
  const initialInvalidation = validateErrandMergeBinding(request, {
    identity,
    target,
    baseOid: null,
  });
  if (initialInvalidation !== null) return initialInvalidation;
  const checks = await dependencies.observeChecks(target);
  if (checks.state === "pending" || checks.state === "unavailable") {
    const unavailable = checks.state === "unavailable";
    return ErrandMergeResultSchema.parse({
      schemaVersion: 1,
      mode: "errand-merge",
      state: "awaiting-checks",
      nextAction: "retry",
      reason: unavailable ? "checks-unavailable" : "checks-pending",
      detail: unavailable ? checks.detail : "Required checks are still pending on the exact approved head.",
      identity: request.identity,
      approvedTarget: request.approvedTarget,
      lane: request.lane,
      coordinates: { observedTarget: target, observedBaseOid: null },
      availabilityCause: unavailable ? checks.cause : null,
      checks: checks.checks,
      diagnosticFailures: checks.diagnosticFailures,
      continuation: exactRetry(
        request,
        "Required checks must settle on the exact approved Errand head before merge.",
        "Retry after external check progress",
      ),
    });
  }
  if (checks.state === "failed") {
    return invalidatedResult(
      request,
      "checks-failed",
      "Required checks failed on the exact approved Errand head.",
      target,
      null,
    );
  }
  if (checks.state === "stale-target") {
    return invalidatedResult(
      request,
      "target-moved",
      "The change-request head moved after approval.",
      { ...target, headSha: checks.actualHeadSha },
      null,
    );
  }
  if (checks.state === "target-mismatch") {
    return invalidatedResult(
      request,
      "target-moved",
      "The observed repository no longer matches the approved target.",
      { ...target, repository: checks.actualRepository },
      null,
    );
  }
  try {
    target = IntegrationMergeTargetSchema.parse(await dependencies.refreshTarget(target));
  } catch (error) {
    return observationFailureResult(request, error, "provider-operation-failed", target, null);
  }
  try {
    identity = await dependencies.readCurrentIdentity();
  } catch (error) {
    return observationFailureResult(request, error, "identity-observation-failed", target, null);
  }
  const postChecksInvalidation = validateErrandMergeBinding(request, {
    identity,
    target,
    baseOid: null,
  });
  if (postChecksInvalidation !== null) return postChecksInvalidation;
  const mergeMethod = await dependencies.resolveMergeMethod(target.repository);
  if (mergeMethod.state !== "validated") {
    return operationFailedResult(
      request,
      "merge-method-resolution-failed",
      "The configured merge method could not be resolved for the approved repository.",
      target,
      null,
    );
  }
  if (mergeMethod.repository?.toLowerCase() !== target.repository.toLowerCase()
    || mergeMethod.stackPosition !== "non-delivery"
    || mergeMethod.method !== request.mergeMethod.method
    || mergeMethod.policyFingerprint !== request.mergeMethod.policyFingerprint) {
    return invalidatedResult(
      request,
      "merge-method-moved",
      "The configured merge method no longer matches the approved policy binding.",
      target,
      null,
    );
  }
  const final = await dependencies.readFinalPlan(target);
  if (final.status === "unavailable") {
    return operationFailedResult(
      request,
      "drift-observation-failed",
      final.detail,
      final.target,
      final.baseOid,
    );
  }
  if (!finalPlanIsExact(final, target)) {
    return invalidatedResult(
      request,
      "target-moved",
      "The final merge evidence no longer describes the exact approved Errand target.",
      final.target,
      final.baseOid,
    );
  }
  if (final.reviewApplicability.judgmentRequired) {
    return applicabilityJudgmentResult(request, final);
  }
  if (final.reviewApplicability.verdict === "fresh") {
    return invalidatedResult(
      request,
      "review-applicability-fresh",
      "The final evidence requires fresh review and exact integration approval.",
      final.target,
      final.baseOid,
      final.reviewApplicability,
    );
  }
  if (final.reviewApplicability.verdict === "carries" && final.plan.state === "reconcile") {
    return reconcileResult(request, final, final.plan.nextAction);
  }
  if (final.plan.state === "blocked") {
    const common = {
      schemaVersion: 1 as const,
      mode: "errand-merge" as const,
      identity: request.identity,
      approvedTarget: request.approvedTarget,
      lane: request.lane,
      coordinates: { observedTarget: final.target, observedBaseOid: final.baseOid },
    };
    if (final.plan.reason === "host-pending") {
      return ErrandMergeResultSchema.parse({
        ...common,
        state: "host-pending",
        nextAction: "retry",
        reason: "host-admission-unresolved",
        detail: final.plan.detail ?? "Host admission remains unresolved for the exact approved target.",
        continuation: exactRetry(
          request,
          "Host admission must resolve for the exact approved Errand target.",
          "Retry the same approved request",
        ),
      });
    }
    if (final.plan.reason === "host-refused") {
      return ErrandMergeResultSchema.parse({
        ...common,
        state: "host-refused",
        nextAction: "stop",
        reason: "host-refused",
        detail: final.plan.detail ?? "The host refused the exact approved Errand merge.",
        continuation: exactRetry(
          request,
          "The host must accept the exact approved Errand target under its configured policy.",
          "Resolve the refusal, then retry the same approved request",
        ),
      });
    }
    const paths = final.plan.reason === "conflict" ? final.plan.paths ?? [] : [];
    return ErrandMergeResultSchema.parse({
      ...common,
      state: "conflict",
      nextAction: "stop",
      reason: final.plan.reason === "conflict" ? "substantive-conflict" : "unsafe-reconcile",
      detail: final.plan.detail ?? (final.plan.reason === "conflict"
        ? "The exact Errand merge has substantive conflicts."
        : "The exact evidence does not authorize a safe reconcile."),
      paths,
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: "No safe automated continuation exists; resolve the evidence or conflict first.",
      },
    });
  }
  if (final.plan.state !== "proceed" || final.reviewApplicability.verdict !== "carries") {
    throw new Error("The final Errand merge plan did not permit direct merge.");
  }
  try {
    identity = await dependencies.readCurrentIdentity();
  } catch (error) {
    return observationFailureResult(request, error, "identity-observation-failed", final.target, final.baseOid);
  }
  const finalInvalidation = validateErrandMergeBinding(request, {
    identity,
    target: final.target,
    baseOid: final.baseOid,
  });
  if (finalInvalidation !== null) return finalInvalidation;
  let release: { state: string };
  try {
    release = await dependencies.releaseLock(target);
  } catch (error) {
    return withReheldTarget(
      request,
      dependencies,
      target,
      final.baseOid,
      operationFailedResult(
        request,
        "lock-operation-failed",
        failureDetail(error),
        target,
        final.baseOid,
        "stop",
      ),
    );
  }
  if (release.state !== "released" && release.state !== "no-lock") {
    return withReheldTarget(
      request,
      dependencies,
      target,
      final.baseOid,
      operationFailedResult(
        request,
        "lock-operation-failed",
        "The exact Errand merge lock could not be released.",
        target,
        final.baseOid,
        "stop",
      ),
    );
  }
  let merged: PinnedMergeResult;
  try {
    merged = await dependencies.mergePinned(target, mergeMethod.method);
  } catch (error) {
    const mutationDetail = failureDetail(error);
    try {
      const confirmed = await dependencies.readMerged(target);
      if (confirmed.merged) return mergedResult(request, confirmed.providerMergeId);
      return await withReheldTarget(
        request,
        dependencies,
        target,
        final.baseOid,
        operationFailedResult(
          request,
          "provider-operation-failed",
          mutationDetail,
          target,
          final.baseOid,
        ),
      );
    } catch (confirmationError) {
      return ErrandMergeResultSchema.parse({
        schemaVersion: 1,
        mode: "errand-merge",
        state: "merge-outcome-unknown",
        nextAction: "retry",
        reason: "mutation-outcome-unknown",
        detail: "The exact Errand merge effect could not be confirmed.",
        identity: request.identity,
        approvedTarget: request.approvedTarget,
        lane: request.lane,
        coordinates: { observedTarget: target, observedBaseOid: final.baseOid },
        mutationDetail,
        confirmationDetail: failureDetail(confirmationError),
        continuation: exactRetry(
          request,
          "An ambiguous mutating request is confirmed before another merge attempt.",
          "Retry the exact approved request to confirm or resume",
        ),
      });
    }
  }
  if (merged.state === "merge-outcome-unknown") {
    return ErrandMergeResultSchema.parse({
      schemaVersion: 1,
      mode: "errand-merge",
      state: "merge-outcome-unknown",
      nextAction: "retry",
      reason: "mutation-outcome-unknown",
      detail: "The exact Errand merge effect could not be confirmed.",
      identity: request.identity,
      approvedTarget: request.approvedTarget,
      lane: request.lane,
      coordinates: { observedTarget: merged.target, observedBaseOid: final.baseOid },
      mutationDetail: merged.mutationDetail,
      confirmationDetail: merged.confirmationDetail,
      continuation: exactRetry(
        request,
        "An ambiguous mutating request is confirmed before another merge attempt.",
        "Retry the exact approved request to confirm or resume",
      ),
    });
  }
  if (merged.state === "head-moved") {
    const movedTarget = { ...merged.target, headSha: merged.actualHead };
    return withReheldTarget(
      request,
      dependencies,
      movedTarget,
      final.baseOid,
      invalidatedResult(
        request,
        "target-moved",
        merged.detail,
        movedTarget,
        final.baseOid,
      ),
    );
  }
  if (merged.state === "refused") {
    let refusedPlan: ErrandMergeFinalPlan;
    try {
      refusedPlan = await dependencies.readFinalPlan(target, {
        state: "refused",
        detail: merged.detail,
      });
    } catch (error) {
      return withReheldTarget(
        request,
        dependencies,
        merged.target,
        final.baseOid,
        operationFailedResult(
          request,
          "drift-observation-failed",
          failureDetail(error),
          merged.target,
          final.baseOid,
        ),
      );
    }
    if (refusedPlan.status === "unavailable") {
      return withReheldTarget(
        request,
        dependencies,
        merged.target,
        refusedPlan.baseOid,
        operationFailedResult(
          request,
          "drift-observation-failed",
          refusedPlan.detail,
          refusedPlan.target,
          refusedPlan.baseOid,
        ),
      );
    }
    if (!finalPlanIsExact(refusedPlan, target)) {
      return withReheldTarget(
        request,
        dependencies,
        refusedPlan.target,
        refusedPlan.baseOid,
        invalidatedResult(
          request,
          "target-moved",
          "The target moved while the definitive host refusal was being classified.",
          refusedPlan.target,
          refusedPlan.baseOid,
        ),
      );
    }
    if (refusedPlan.baseOid !== final.baseOid) {
      return withReheldTarget(
        request,
        dependencies,
        refusedPlan.target,
        refusedPlan.baseOid,
        invalidatedResult(
          request,
          "base-moved",
          "The target base moved while the definitive host refusal was being classified.",
          refusedPlan.target,
          refusedPlan.baseOid,
        ),
      );
    }
    if (refusedPlan.plan.state === "blocked" && refusedPlan.plan.reason === "host-refused") {
      return withReheldTarget(
        request,
        dependencies,
        refusedPlan.target,
        refusedPlan.baseOid,
        ErrandMergeResultSchema.parse({
          schemaVersion: 1,
          mode: "errand-merge",
          state: "host-refused",
          nextAction: "stop",
          reason: "host-refused",
          detail: refusedPlan.plan.detail ?? merged.detail,
          identity: request.identity,
          approvedTarget: request.approvedTarget,
          lane: request.lane,
          coordinates: { observedTarget: refusedPlan.target, observedBaseOid: refusedPlan.baseOid },
          continuation: exactRetry(
            request,
            "The host must accept the exact approved Errand target under its configured policy.",
            "Resolve the refusal, then retry the same approved request",
          ),
        }),
      );
    }
    return withReheldTarget(
      request,
      dependencies,
      refusedPlan.target,
      refusedPlan.baseOid,
      operationFailedResult(
        request,
        "provider-operation-failed",
        "The definitive host refusal did not reduce to a matching terminal plan.",
        refusedPlan.target,
        refusedPlan.baseOid,
        "stop",
      ),
    );
  }
  if (merged.state === "base-currentness-required") {
    let currentnessPlan: ErrandMergeFinalPlan;
    try {
      currentnessPlan = await dependencies.readFinalPlan(target, {
        state: "base-currentness-required",
        detail: merged.detail,
      });
    } catch (error) {
      return withReheldTarget(
        request,
        dependencies,
        merged.target,
        final.baseOid,
        operationFailedResult(
          request,
          "drift-observation-failed",
          failureDetail(error),
          merged.target,
          final.baseOid,
        ),
      );
    }
    if (currentnessPlan.status === "unavailable") {
      return withReheldTarget(
        request,
        dependencies,
        merged.target,
        currentnessPlan.baseOid,
        operationFailedResult(
          request,
          "drift-observation-failed",
          currentnessPlan.detail,
          currentnessPlan.target,
          currentnessPlan.baseOid,
        ),
      );
    }
    if (!finalPlanIsExact(currentnessPlan, target)) {
      return withReheldTarget(
        request,
        dependencies,
        currentnessPlan.target,
        currentnessPlan.baseOid,
        invalidatedResult(
          request,
          "target-moved",
          "The target moved while the host currentness requirement was being classified.",
          currentnessPlan.target,
          currentnessPlan.baseOid,
        ),
      );
    }
    if (currentnessPlan.baseOid !== final.baseOid) {
      return withReheldTarget(
        request,
        dependencies,
        currentnessPlan.target,
        currentnessPlan.baseOid,
        invalidatedResult(
          request,
          "base-moved",
          "The target base moved while the host currentness requirement was being classified.",
          currentnessPlan.target,
          currentnessPlan.baseOid,
        ),
      );
    }
    if (currentnessPlan.reviewApplicability.judgmentRequired) {
      return withReheldTarget(
        request,
        dependencies,
        currentnessPlan.target,
        currentnessPlan.baseOid,
        applicabilityJudgmentResult(request, currentnessPlan),
      );
    }
    if (currentnessPlan.reviewApplicability.verdict === "fresh") {
      return withReheldTarget(
        request,
        dependencies,
        currentnessPlan.target,
        currentnessPlan.baseOid,
        invalidatedResult(
          request,
          "review-applicability-fresh",
          "The final evidence requires fresh review and exact integration approval.",
          currentnessPlan.target,
          currentnessPlan.baseOid,
          currentnessPlan.reviewApplicability,
        ),
      );
    }
    if (currentnessPlan.reviewApplicability.verdict === "carries"
      && currentnessPlan.plan.state === "reconcile") {
      return withReheldTarget(
        request,
        dependencies,
        currentnessPlan.target,
        currentnessPlan.baseOid,
        reconcileResult(request, currentnessPlan, currentnessPlan.plan.nextAction),
      );
    }
    return withReheldTarget(
      request,
      dependencies,
      currentnessPlan.target,
      currentnessPlan.baseOid,
      operationFailedResult(
        request,
        "provider-operation-failed",
        "Complete exact integration evidence did not authorize base reconciliation.",
        currentnessPlan.target,
        currentnessPlan.baseOid,
        "stop",
      ),
    );
  }
  if (merged.state === "operation-failed") {
    return withReheldTarget(
      request,
      dependencies,
      merged.target,
      final.baseOid,
      operationFailedResult(
        request,
        "provider-operation-failed",
        merged.detail,
        merged.target,
        final.baseOid,
      ),
    );
  }
  return mergedResult(request, merged.providerMergeId);
}

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
  return invalidatedResult(request, reason, detail, observed.target, observed.baseOid);
}
