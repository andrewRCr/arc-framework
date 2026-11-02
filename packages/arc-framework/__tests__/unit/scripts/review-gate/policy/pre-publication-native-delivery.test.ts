/**
 * Natively, a delivery plan's re-entries keep the Owner judgments an earlier call carried: a terminus recorded on the
 * Candidate applies to the member a later call selects, and grants a scope refusal could not yet bind reach that member.
 */
import { mapReviewBoundaryAction } from "../../../../../src/lib/store/kinds/review/mapping-boundary-actions.js";
import { expect, it } from "vitest";

import { buildPrePublicationResumeCommand } from "../../../../../src/handlers/review-pre-publication-replay.js";
import { canonicalDigest, type CanonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { composePrePublicationReviewRequest } from "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import { decodePrePublicationReplay, replayTokenFromAction } from "../../../../../src/scripts/review-gate/policy/pre-publication-replay.js";
import { deliveryMember, nativeDeliveryCompositionDependencies, cleanFrontlineResult } from "../../../../helpers/store/native-delivery-composition.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewRequirement } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewResult } from "../../../../../src/scripts/review-gate/core/review-result.js";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { createLocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";

const HEAD = "a".repeat(40);
const REPOSITORY = "arc-framework/example";
const CANDIDATE_ID: CanonicalDigest = `sha256:${"c".repeat(64)}`;
const SUBJECT_DIGEST: CanonicalDigest = `sha256:${"d".repeat(64)}`;

// The first member's frontline pass is complete, so a plan selects the second; the first is where a scope refuses.
const first = deliveryMember(REPOSITORY, "1", "2", "3"), second = deliveryMember(REPOSITORY, "4", "3", "5");

async function deliveryFixture() {
  const h = createReviewHarness(), owner = (await h.seedMeta("example")).reference.owner;
  const dependencies = nativeDeliveryCompositionDependencies({ store: h.store, owner, repository: REPOSITORY,
    actor: "andrew", now: "2026-11-01T12:00:00Z", candidate: { candidateId: CANDIDATE_ID, subjectDigest: SUBJECT_DIGEST,
      headSha: HEAD }, members: () => [first, second] });
  const decisions = createReviewDecisionPort(h.store, owner);
  const listDecisions = async () => {
    const listing = await decisions.list();
    if (listing.status !== "complete") throw new Error(listing.reason);
    return listing.records.map(({ value }) => value);
  };
  return { h, owner, dependencies, listDecisions };
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

    // Re-enter with the token the remedy carries: the confirmed scope, the call's inputs, and the retained grants.
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

it("reports the member targets a delivery selection examined, through the refusing member", async () => {
  const { dependencies } = await deliveryFixture();
  const refused = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled",
    lanes: { frontline: { scopeMode: "chunked" } } }, dependencies);
  expect(refused, JSON.stringify(refused)).toMatchObject({ status: "refused", code: "scope-judgment-required",
    examinedTargets: [first.target] });
  const composed = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled",
    lanes: { frontline: { scopeMode: "whole-target" } } }, dependencies);
  expect(composed, JSON.stringify(composed)).toMatchObject({ status: "composed", request: { target: second.target },
    examinedTargets: [first.target, second.target] });
});

it.each(grants)("binds an imported $name to the selected delivery member", async ({ lane, field, nextPass, lanes }) => {
  const { dependencies, listDecisions, owner } = await deliveryFixture();
  const original = { candidateId: CANDIDATE_ID, candidateSubjectDigest: SUBJECT_DIGEST, selfReview: "settled" as const,
    lanes: { ...lanes, frontline: { ...lanes.frontline, scopeMode: "whole-target" as const } },
    scopeJudgmentTarget: first.target,
    ...(lane === "frontline" ? { frontlineCeilingHeadSha: second.target.headSha } : {}) };
  const token = Buffer.from(JSON.stringify(original)).toString("base64url");
  const action = mapReviewBoundaryAction({ kind: "continue-pre-publication-review",
    command: `arc review pre-publication example --resume ${token}`, interactionText: "Resume" }, "example", [],
    { repositoryId: REPOSITORY, workItem: owner }) as { command: string };
  const replay = decodePrePublicationReplay(replayTokenFromAction(action.command, "example"), 2);
  const result = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: replay.selfReview,
    lanes: replay.lanes, scopeJudgmentTarget: replay.scopeJudgmentTarget, frontlineCeilingHeadSha: replay.frontlineCeilingHeadSha }, dependencies);
  expect(result, JSON.stringify(result)).toMatchObject({ status: "composed", request: { target: second.target,
    [lane]: { [field]: { nextPass, decisionKey: expect.stringMatching(/^sha256:/u) } } } });
  expect(await listDecisions()).toMatchObject([{ lane, subject: { lineage: { kind: "delivery-member",
    deliverableId: second.vehicle.deliverableId }, headSha: second.target.headSha } }]);
  if (lane === "frontline") {
    const { dependencies: foreign, listDecisions: foreignDecisions } = await deliveryFixture();
    await composePrePublicationReviewRequest({ workUnit: "example", selfReview: replay.selfReview, lanes: replay.lanes,
      scopeJudgmentTarget: replay.scopeJudgmentTarget, frontlineCeilingHeadSha: first.target.headSha }, foreign);
    expect(await foreignDecisions()).toEqual([]);
  }
});

async function completedGrantFixture(lane: "frontline" | "standard", logicalPass: number) {
  const fixture = await deliveryFixture(), { dependencies } = fixture;
  const baseline = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled" }, dependencies);
  if (baseline.status !== "composed") throw new Error(JSON.stringify(baseline));
  const lineage = { kind: "delivery-member" as const, planId: second.vehicle.planId,
    deliverableId: second.vehicle.deliverableId, workUnitId: second.vehicle.workUnitId };
  const requirement = createReviewRequirement({ target: second.target, projection: baseline.request.standard.standardReview,
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }], initialAdmission: "automatic" });
  if (requirement === null) throw new Error("Expected a standard obligation");
  const vehicle = { kind: "delivery-member" as const, identity: second.vehicle.deliverableId };
  const admission = createLocalReviewAdmission({ target: second.target, requirement, lineage, logicalPass, retryGeneration: 0,
    authority: { vehicle, authorIdentity: "andrew", evaluatorIdentity: "reviewer", attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/1.0.0", attestationMechanism: "local-attestation" }, laneSourceId: "delegated-agent",
    policyBindingDigest: canonicalDigest({ policy: "terminal" }), requestMechanism: "local-attestation",
    coverageAdmission: { requestedCoverage: "complete" } });
  const frontline = cleanFrontlineResult(REPOSITORY, second);
  const result: ReviewResult = lane === "frontline" && frontline.kind === "frontline"
    ? { ...frontline, admission: { ...frontline.admission, logicalPass }, outcome: { ...frontline.outcome, pass: logicalPass, maxPasses: 1 } }
    : { kind: "attested-local", producerId: admission.operationId, repositoryId: REPOSITORY, target: second.target,
      sourceIdentity: admission.carrier.request.evaluatorIdentity, originalOutcome: "clean", findings: [], resultDigest: canonicalDigest({ terminal: logicalPass }),
      admission: { lineage, logicalPass, retryGeneration: 0, requestedCoverage: "complete", effectiveCoverage: "complete",
        scopeMode: "whole-target", policyVersion: requirement.policyVersion }, vehicle,
      receiptRef: "receipt:completed-standard", localSourceRef: canonicalDigest({ source: "terminal" }),
      requirement, request: admission.carrier.request };
  return { ...fixture, dependencies: { ...dependencies,
    readLanePolicy: async (selected: "frontline" | "standard") => ({ sources: selected === "frontline" ? ["coderabbit-cli"] : ["delegated-agent"],
      maxPasses: selected === "frontline" && lane === "frontline" ? 1 : 2 }),
    readLaneProgress: async (...args: Parameters<typeof dependencies.readLaneProgress>) => args[0] === lane && args[1] === second.target.headSha
      ? { status: "recorded" as const, completedPasses: logicalPass, completePasses: logicalPass, attempts: [{ attemptId: result.producerId,
        logicalPass, sourceId: lane === "frontline" ? "coderabbit-cli" : "delegated-agent", outcome: "clean" as const }] } : dependencies.readLaneProgress(...args),
    resultReader: { readResult: async (producerId: string) => {
      const value = producerId === result.producerId ? result : await dependencies.resultReader.readResult(producerId);
      return lane === "frontline" && value.kind === "frontline" ? { ...value, outcome: { ...value.outcome, maxPasses: 1 } } : value;
    } },
  } };
}

it.each(grants)("continues a completed imported $name without authorizing another pass", async ({ lane, field, nextPass, lanes }) => {
  const { h, owner, dependencies, listDecisions } = await completedGrantFixture(lane, nextPass);
  const token = Buffer.from(JSON.stringify({ candidateId: CANDIDATE_ID, candidateSubjectDigest: SUBJECT_DIGEST,
    selfReview: "settled", lanes, ...(lane === "frontline" ? { frontlineCeilingHeadSha: second.target.headSha } : {}) })).toString("base64url");
  const action = mapReviewBoundaryAction({ kind: "continue-pre-publication-review",
    command: `arc review pre-publication example --resume ${token}`, interactionText: "Resume review." }, "example", [],
  { repositoryId: REPOSITORY, workItem: owner }) as { command: string };
  const replay = decodePrePublicationReplay(replayTokenFromAction(action.command, "example"), 2);
  const input = { workUnit: "example", selfReview: replay.selfReview, lanes: replay.lanes, frontlineCeilingHeadSha: replay.frontlineCeilingHeadSha };
  const resumed = await composePrePublicationReviewRequest(input, dependencies);
  expect(resumed, JSON.stringify(resumed)).toMatchObject({ status: "composed" });
  if (resumed.status !== "composed") return;
  const request = resumed.request[lane];
  expect(resolveReviewPolicy(request), JSON.stringify(request)).toMatchObject({ state: "pass-complete", nextAction: "none" });
  if (field === "additionalPassAuthorization") {
    expect(request.additionalPassAuthorization).toBeUndefined();
    expect(await listDecisions()).toEqual([]);
  } else expect(await listDecisions()).toMatchObject([{ lane, choice: { kind: "extra-pass", passCount: nextPass - 1 } }]);
  const next = resolveReviewPolicy({ ...request, attempts: [], verifiedTerminalSignal: undefined });
  expect(next.state).not.toBe("ready");
  const before = await h.store.version();
  const retry = await composePrePublicationReviewRequest(input, dependencies);
  expect(retry).toMatchObject({ status: "composed" });
  expect(await h.store.version()).toEqual(before);
});
