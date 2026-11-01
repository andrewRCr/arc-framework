/** A native delivery plan's pre-publication composition over a review store, with clean frontline members. */
import { canonicalDigest, SlugSchema, type CanonicalDigest } from "../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../src/lib/delivery/review-vehicle.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { OwnerIdentity } from "../../../src/lib/store/identity.js";
import { createReviewDecisionPort } from "../../../src/lib/store/kinds/review/decision/access.js";
import { createReviewTarget } from "../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewResult } from "../../../src/scripts/review-gate/core/review-result.js";
import type { LaneProgressProjection } from "../../../src/scripts/review-gate/lane-progress.js";
import type { PreBindingDeliveryReviewTarget } from "../../../src/scripts/review-gate/policy/pre-publication-delivery-targets.js";
import type { PrePublicationCompositionDependencies, ReviewLane } from "../../../src/scripts/review-gate/policy/pre-publication-request.js";
import { resolveNativeExtraPassJudgment } from "../../../src/scripts/review-gate/runtime/native-extra-pass.js";
import { resolveNativeReviewTerminus } from "../../../src/scripts/review-gate/runtime/native-terminus.js";
import { prepareNativeReviewTerminus } from "../../../src/scripts/review-gate/runtime/native-terminus-write.js";

export const DELIVERY_PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";

/** One private delivery member's exact target and vehicle. */
export function deliveryMember(repository: string, deliverable: string, base: string, head: string):
  PreBindingDeliveryReviewTarget {
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
    repositoryId: repository, baseRef: "main", diffBaseSha: base.repeat(40), diffBaseTree: base.repeat(40),
    headSha: head.repeat(40), headTree: head.repeat(40) });
  return { target, vehicle: DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", planId: DELIVERY_PLAN_ID,
    deliverableId: `sha256:${deliverable.repeat(64)}`, workUnitId: "example", head: target.headSha }) };
}

/** The clean whole-target frontline result a member's completed frontline pass produced. */
export function cleanFrontlineResult(repository: string, selected: PreBindingDeliveryReviewTarget): ReviewResult {
  const producerId = `clean-${selected.target.headSha}`;
  const source = { sourceId: "coderabbit-cli", kind: "command" as const, executable: "coderabbit", argv: ["review"] };
  const { planId, deliverableId, workUnitId } = selected.vehicle;
  return { kind: "frontline", producerId, repositoryId: repository, target: selected.target,
    sourceIdentity: source.sourceId, originalOutcome: "clean", findings: [], resultDigest: canonicalDigest({ producerId }),
    admission: { lineage: { kind: "delivery-member", planId, deliverableId, workUnitId }, logicalPass: 1,
      retryGeneration: 0, requestedCoverage: "complete", effectiveCoverage: "complete", scopeMode: "whole-target",
      policyVersion: canonicalDigest({ policy: "frontline" }) },
    outcomeRef: `frontline/${producerId}`, sourceBindingId: canonicalDigest({ source: source.sourceId }),
    executableIdentity: null, outcome: { schemaVersion: 1, semanticsVersion: "frontline-review/v1", source,
      target: selected.target, pass: 1, maxPasses: 2, outcome: "clean", findings: [], reason: null } };
}

/**
 * Compose a native delivery plan whose members each completed one clean frontline pass and two standard passes, reading
 * and writing the Owner's decisions in the given store. `members` is read on every call, so a test may move a member.
 */
export function nativeDeliveryCompositionDependencies(input: {
  store: Store; owner: OwnerIdentity; repository: string; actor: string; now: string;
  candidate: { candidateId: CanonicalDigest; subjectDigest: CanonicalDigest; headSha: string };
  members: () => readonly PreBindingDeliveryReviewTarget[];
}): PrePublicationCompositionDependencies {
  const { repository, candidate } = input;
  const facts = { decisions: createReviewDecisionPort(input.store, input.owner), readProjectId: async () => repository };
  const rootTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: repository, baseRef: "main", diffBaseSha: "c".repeat(40), diffBaseTree: "d".repeat(40),
    headSha: candidate.headSha, headTree: "e".repeat(40) });
  return {
    stateOffBranch: true,
    resultReader: { readResult: async (producerId: string) => {
      const result = input.members().map(value => cleanFrontlineResult(repository, value))
        .find(value => value.producerId === producerId);
      if (result === undefined) throw new Error(`missing result ${producerId}`);
      return result;
    } },
    dispositionStore: { readDispositionRecord: async () => null },
    readResponsePerformance: async () => null,
    confirmIncrementalApplicability: async () => "applicable",
    confirmPriorProducerApplicability: async () => "applicable",
    readCandidate: async () => ({ status: "current", ...candidate, implementationChanged: false,
      convergenceVerification: "satisfied", convergenceScope: null, lineageHeadShas: [candidate.headSha] }),
    readAssurance: async () => ({ status: "resolved", assurance: { workContext: "work-unit", workClass: "Heavy" },
      activity: { selfReview: true, frontlineReview: true } }),
    resolveTarget: async () => ({ status: "resolved",
      target: { repository, pullRequest: null, headSha: candidate.headSha } }),
    readReservationTarget: async (_workUnit, singleton) => ({ status: "resolved", target: { kind: "delivery",
      repository: singleton.repository, planId: DELIVERY_PLAN_ID, workUnitId: SlugSchema.parse("example") } }),
    readDeliveryReviewTargets: async () => ({ status: "composed", planId: DELIVERY_PLAN_ID, targets: input.members() }),
    deriveImmutableTarget: async () => ({ status: "resolved", target: rootTarget }),
    readOwnerTerminusAuthority: async () => ({ status: "authorized", ownerIdentity: input.actor }),
    readLaneProgress: async (lane: ReviewLane, headSha: string): Promise<LaneProgressProjection> => lane === "frontline"
      ? { status: "recorded", completedPasses: 1, completePasses: 1, attempts: [{ attemptId: `clean-${headSha}`,
        logicalPass: 1, sourceId: "coderabbit-cli", outcome: "clean" }] }
      : { status: "recorded", completedPasses: 2, completePasses: 2, attempts: [] },
    readLanePolicy: async (lane: ReviewLane) => lane === "frontline"
      ? { sources: ["coderabbit-cli"], maxPasses: 2 } : { sources: ["codex-pr"], maxPasses: 2 },
    resolveExtraPassJudgment: async context => (await resolveNativeExtraPassJudgment({ ...context, facts,
      repositoryId: context.repositoryId ?? repository, actor: input.actor, now: input.now })).judgment,
    resolveNativeTerminus: async context => resolveNativeReviewTerminus({ facts, ...context }),
    prepareNativeTerminusDecision: async context => prepareNativeReviewTerminus({ facts, ...context, now: input.now }),
  };
}
