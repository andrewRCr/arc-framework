/**
 * Natively, a delivery plan's re-entries keep the Owner judgments an earlier call carried: a terminus recorded on the
 * Candidate applies to the member a later call selects, and grants a scope refusal could not yet bind reach that member.
 */
import { expect, it } from "vitest";

import { buildPrePublicationResumeCommand } from "../../../../../src/handlers/review-pre-publication-replay.js";
import type { CanonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { composePrePublicationReviewRequest } from "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import { decodePrePublicationReplay, replayTokenFromAction } from "../../../../../src/scripts/review-gate/policy/pre-publication-replay.js";
import { deliveryMember, nativeDeliveryCompositionDependencies } from "../../../../helpers/store/native-delivery-composition.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";

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
