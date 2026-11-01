/**
 * Natively, a delivery plan's re-entries keep the Owner judgments an earlier call carried: a terminus recorded on the
 * Candidate applies to the member a later call selects, and grants a scope refusal could not yet bind reach that member.
 */
import { expect, it, vi } from "vitest";

import { buildPrePublicationResumeCommand } from "../../../../../src/handlers/review-pre-publication-replay.js";
import { canonicalDigest, SlugSchema, type CanonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../../src/lib/delivery/review-vehicle.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewResult } from "../../../../../src/scripts/review-gate/core/review-result.js";
import type { LaneProgressProjection } from "../../../../../src/scripts/review-gate/lane-progress.js";
import type { PreBindingDeliveryReviewTarget } from "../../../../../src/scripts/review-gate/policy/pre-publication-delivery-targets.js";
import {
  composePrePublicationReviewRequest,
  type PrePublicationCompositionDependencies,
  type ReviewLane,
} from "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import { decodePrePublicationReplay, replayTokenFromAction } from "../../../../../src/scripts/review-gate/policy/pre-publication-replay.js";
import { resolveNativeExtraPassJudgment } from "../../../../../src/scripts/review-gate/runtime/native-extra-pass.js";
import { resolveNativeReviewTerminus } from "../../../../../src/scripts/review-gate/runtime/native-terminus.js";
import { prepareNativeReviewTerminus } from "../../../../../src/scripts/review-gate/runtime/native-terminus-write.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";

const HEAD = "a".repeat(40);
const REPOSITORY = "arc-framework/example";
const PLAN = "123e4567-e89b-12d3-a456-426614174000";
const CANDIDATE_ID: CanonicalDigest = `sha256:${"c".repeat(64)}`;
const SUBJECT_DIGEST: CanonicalDigest = `sha256:${"d".repeat(64)}`;
const assurance = { workContext: "work-unit", workClass: "Heavy" } as const;
const activity = { selfReview: true, frontlineReview: true };
const rootTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
  repositoryId: REPOSITORY, baseRef: "main", diffBaseSha: "c".repeat(40), diffBaseTree: "d".repeat(40), headSha: HEAD,
  headTree: "e".repeat(40) });

function member(deliverable: string, base: string, head: string): PreBindingDeliveryReviewTarget {
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
    repositoryId: REPOSITORY, baseRef: "main", diffBaseSha: base.repeat(40), diffBaseTree: base.repeat(40),
    headSha: head.repeat(40), headTree: head.repeat(40) });
  return { target, vehicle: DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", planId: PLAN,
    deliverableId: `sha256:${deliverable.repeat(64)}`, workUnitId: "example", head: target.headSha }) };
}

// The first member's frontline pass is complete, so a plan selects the second; the first is where a scope refuses.
const first = member("1", "2", "3"), second = member("4", "3", "5");

function frontlineClean(selected: PreBindingDeliveryReviewTarget): ReviewResult {
  const producerId = `clean-${selected.target.headSha}`;
  const source = { sourceId: "coderabbit-cli", kind: "command" as const, executable: "coderabbit", argv: ["review"] };
  const { planId, deliverableId, workUnitId } = selected.vehicle;
  return { kind: "frontline", producerId, repositoryId: REPOSITORY, target: selected.target,
    sourceIdentity: source.sourceId, originalOutcome: "clean", findings: [], resultDigest: canonicalDigest({ producerId }),
    admission: { lineage: { kind: "delivery-member", planId, deliverableId, workUnitId }, logicalPass: 1,
      retryGeneration: 0, requestedCoverage: "complete", effectiveCoverage: "complete", scopeMode: "whole-target",
      policyVersion: canonicalDigest({ policy: "frontline" }) },
    outcomeRef: `frontline/${producerId}`, sourceBindingId: canonicalDigest({ source: source.sourceId }),
    executableIdentity: null, outcome: { schemaVersion: 1, semanticsVersion: "frontline-review/v1", source,
      target: selected.target, pass: 1, maxPasses: 2, outcome: "clean", findings: [], reason: null } };
}

async function deliveryFixture() {
  const h = createReviewHarness(), owner = (await h.seedMeta("example")).reference.owner;
  const facts = { decisions: createReviewDecisionPort(h.store, owner), readProjectId: async () => REPOSITORY };
  const results = [frontlineClean(first), frontlineClean(second)];
  const now = "2026-11-01T12:00:00Z";
  const dependencies: PrePublicationCompositionDependencies = {
    stateOffBranch: true,
    resultReader: { readResult: vi.fn(async (producerId: string) => {
      const result = results.find(value => value.producerId === producerId);
      if (result === undefined) throw new Error(`missing result ${producerId}`);
      return result;
    }) },
    dispositionStore: { readDispositionRecord: vi.fn(async () => null) },
    readResponsePerformance: vi.fn(async () => null),
    confirmIncrementalApplicability: vi.fn(async () => "applicable" as const),
    confirmPriorProducerApplicability: vi.fn(async () => "applicable" as const),
    readCandidate: vi.fn(async () => ({ status: "current" as const, candidateId: CANDIDATE_ID, headSha: HEAD,
      subjectDigest: SUBJECT_DIGEST, implementationChanged: false, convergenceVerification: "satisfied" as const,
      convergenceScope: null, lineageHeadShas: [HEAD] })),
    readAssurance: vi.fn(async () => ({ status: "resolved" as const, assurance, activity })),
    resolveTarget: vi.fn(async () => ({ status: "resolved" as const,
      target: { repository: REPOSITORY, pullRequest: null, headSha: HEAD } })),
    readReservationTarget: vi.fn(async (_workUnit: string, singleton: { repository: string }) => ({
      status: "resolved" as const, target: { kind: "delivery" as const, repository: singleton.repository, planId: PLAN,
        workUnitId: SlugSchema.parse("example") } })),
    readDeliveryReviewTargets: vi.fn(async () => ({ status: "composed" as const, planId: PLAN, targets: [first, second] })),
    deriveImmutableTarget: vi.fn(async () => ({ status: "resolved" as const, target: rootTarget })),
    readOwnerTerminusAuthority: vi.fn(async () => ({ status: "authorized" as const, ownerIdentity: "andrew" })),
    readLaneProgress: vi.fn(async (lane: ReviewLane, headSha: string): Promise<LaneProgressProjection> => lane === "frontline"
      ? { status: "recorded", completedPasses: 1, completePasses: 1, attempts: [{ attemptId: `clean-${headSha}`,
        logicalPass: 1, sourceId: "coderabbit-cli", outcome: "clean" }] }
      : { status: "recorded", completedPasses: 2, completePasses: 2, attempts: [] }),
    readLanePolicy: vi.fn(async (lane: ReviewLane) => lane === "frontline"
      ? { sources: ["coderabbit-cli"], maxPasses: 2 } : { sources: ["codex-pr"], maxPasses: 2 }),
    resolveExtraPassJudgment: async context => (await resolveNativeExtraPassJudgment({ ...context, facts,
      repositoryId: context.repositoryId ?? REPOSITORY, actor: "andrew", now })).judgment,
    resolveNativeTerminus: async context => resolveNativeReviewTerminus({ facts, ...context }),
    prepareNativeTerminusDecision: async context => prepareNativeReviewTerminus({ facts, ...context, now }),
  };
  const listDecisions = async () => {
    const listing = await facts.decisions.list();
    if (listing.status !== "complete") throw new Error(listing.reason);
    return listing.records.map(({ value }) => value);
  };
  return { h, dependencies, listDecisions };
}

it("applies a terminus recorded before self-review settled to the member its re-entry selects", async () => {
  const { h, dependencies } = await deliveryFixture();
  const pending = await composePrePublicationReviewRequest({ workUnit: "example", lanes: {
    frontline: { scopeMode: "whole-target" }, standard: { terminus: { mode: "owner-accepted" } } } }, dependencies);
  expect(pending, JSON.stringify(pending)).toMatchObject({ status: "composed", request: { selfReview: "pending" },
    terminusDecision: { key: expect.stringMatching(/^sha256:/u), put: { action: "put" } } });
  if (pending.status !== "composed" || pending.terminusDecision?.put === undefined) return;
  await h.store.write({ ...pending.terminusDecision.put, provenance: { verb: "review", lifecycleAction: "edit" } });

  const resumed = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled",
    lanes: { frontline: { scopeMode: "whole-target" } } }, dependencies);
  expect(resumed, JSON.stringify(resumed)).toMatchObject({ status: "composed", request: {
    target: { headSha: second.target.headSha },
    standard: { terminus: { kind: "owner-accepted", decisionKey: pending.terminusDecision.key } },
  } });
});

it("applies a terminus a delivery plan's scope refusal recorded to the member its remedy selects", async () => {
  const { h, dependencies } = await deliveryFixture();
  const refused = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled", lanes: {
    frontline: { scopeMode: "chunked" }, standard: { terminus: { mode: "owner-accepted" } } } }, dependencies);
  expect(refused, JSON.stringify(refused)).toMatchObject({ status: "refused", code: "scope-judgment-required",
    scopeMismatch: { lane: "frontline", target: { headSha: first.target.headSha } },
    terminusDecision: { put: { action: "put" } } });
  if (refused.status !== "refused" || refused.terminusDecision?.put === undefined) return;
  await h.store.write({ ...refused.terminusDecision.put, provenance: { verb: "review", lifecycleAction: "edit" } });

  const resumed = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled",
    lanes: { frontline: { scopeMode: "whole-target" } } }, dependencies);
  expect(resumed, JSON.stringify(resumed)).toMatchObject({ status: "composed", request: {
    target: { headSha: second.target.headSha },
    standard: { terminus: { kind: "owner-accepted", decisionKey: refused.terminusDecision.key } },
  } });
});

const grants = [
  { name: "standard ceiling override", lane: "standard", field: "ceilingOverride", nextPass: 3,
    lanes: { frontline: {}, standard: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } } },
  { name: "standard additional pass", lane: "standard", field: "additionalPassAuthorization", nextPass: 3,
    lanes: { frontline: {}, standard: { additionalPassAuthorization: { headSha: second.target.headSha,
      precedingProducerId: "producer-2", completedPasses: 2, nextPass: 3 } } } },
  { name: "frontline ceiling override", lane: "frontline", field: "ceilingOverride", nextPass: 2,
    lanes: { frontline: { ceilingOverride: { exhaustedPassCount: 1, nextPass: 2 } }, standard: {} } },
] as const;

it.each(grants)("keeps a $name through a scope refusal raised before member selection, for the member its remedy selects",
  async ({ lane, field, nextPass, lanes }) => {
    const { dependencies, listDecisions } = await deliveryFixture();
    const call = { ...lanes, frontline: { ...lanes.frontline, scopeMode: "chunked" as const } };
    const refused = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled", lanes: call },
      dependencies);
    expect(refused, JSON.stringify(refused)).toMatchObject({ status: "refused", code: "scope-judgment-required",
      scopeMismatch: { lane: "frontline", target: { headSha: first.target.headSha } }, retainsGrants: true });
    expect(await listDecisions()).toEqual([]);
    if (refused.status !== "refused" || refused.scopeMismatch === undefined) return;

    // Follow the remedy as the command emits it: the confirmed scope, the call's inputs, and the retained grants.
    const required = { ...call, frontline: { ...call.frontline, scopeMode: refused.scopeMismatch.observedScope } };
    const command = buildPrePublicationResumeCommand({ schemaVersion: 2, workUnit: "example", candidateId: CANDIDATE_ID,
      candidateSubjectDigest: SUBJECT_DIGEST, judgment: { selfReview: "settled", changeSet: undefined, lanes: required,
        frontlineCeilingHeadSha: undefined }, replaySelfReview: "settled", replayLanes: required,
      scopeJudgmentTarget: refused.scopeMismatch.target, currentFrontlineHeadSha: HEAD,
      frontlineCeilingOverrideApplied: false, retainGrants: refused.retainsGrants === true });
    const replay = decodePrePublicationReplay(replayTokenFromAction(command, "example"), 2);
    const resumed = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: replay.selfReview,
      lanes: replay.lanes }, dependencies);
    expect(resumed, JSON.stringify(resumed)).toMatchObject({ status: "composed", request: {
      target: { headSha: second.target.headSha },
      [lane]: { [field]: { nextPass, target: { headSha: second.target.headSha },
        decisionKey: expect.stringMatching(/^sha256:/u) } },
    } });
    expect((await listDecisions()).map(value => ({ lane: value.lane, kind: value.choice.kind,
      headSha: value.subject.headSha }))).toEqual([{ lane, kind: "extra-pass", headSha: second.target.headSha }]);
  });

it("refuses a grant bound to the member a plan selects with the scope judgment, not its binding", async () => {
  const { dependencies } = await deliveryFixture();
  const refused = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled", lanes: {
    frontline: { scopeMode: "chunked" }, standard: { additionalPassAuthorization: { headSha: second.target.headSha,
      precedingProducerId: "producer-2", completedPasses: 2, nextPass: 3 } } } }, dependencies);
  expect(refused, JSON.stringify(refused)).toMatchObject({ status: "refused", code: "scope-judgment-required",
    scopeMismatch: { lane: "frontline", target: { headSha: first.target.headSha } } });
});
