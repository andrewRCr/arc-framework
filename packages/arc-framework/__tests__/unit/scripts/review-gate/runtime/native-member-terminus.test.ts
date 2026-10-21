/** Native member authority joins the boundary atomically and remains exact on replay. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { terminusDecision, extraPassDecision } from "../../../../fixtures/review-decision.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../../src/lib/delivery/review-vehicle.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../../../../src/lib/store/kinds/review/decision/key.js";
import { readSubmissionBoundaryVersioned, SubmissionBoundaryVersionConflictError } from "../../../../../src/lib/store/kinds/review/integration-boundary/access.js";
import { createStandardReviewReservation, projectPublicationBoundary, type PublishedIntegrationBoundaryLocus } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectStandardReviewObligation } from "../../../../../src/scripts/review-gate/policy/standard-review-projection.js";
import { resolveReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";
import { DeliveryReviewTerminusOfferSchema, resolveDeliveryReviewTerminusAcceptance } from "../../../../../src/scripts/review-gate/policy/delivery-review-terminus.js";
import { createReviewCompositionContext } from "../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { createNativeMemberTerminusBindings, readStoredDeliveryReviewMemberTermini } from "../../../../../src/scripts/review-gate/runtime/native-member-terminus.js";
import type { ReviewFactPut } from "../../../../../src/scripts/review-gate/core/ports.js";
import { persistNativeTerminusBoundary } from "../../../../../src/scripts/review-gate/runtime/native-terminus-persistence.js";

async function fixture() {
  const h = createReviewHarness(), primary = await h.seedMeta("example");
  const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", workUnitId: "example",
    planId: "123e4567-e89b-42d3-a456-426614174000", deliverableId: canonicalDigest({ member: 1 }), head: "a".repeat(40) });
  const { head, ...lineage } = vehicle;
  const subject = { lineage, headSha: head, subjectDigest: null };
  const decisions = createReviewDecisionPort(h.store, primary.reference.owner);
  const invocation = { cwd: "/native-member-fixture", exec: scriptGitExec([]).exec, store: h.store,
    workItem: primary.reference.owner, projectId: h.projectId };
  const inFlight = createReviewCompositionContext(invocation).family.ports.inFlight;
  const candidateId = canonicalDigest({ candidate: 1 });
  const boundary = projectPublicationBoundary({ workUnit: "example", branch: "feat/example", candidateId,
    candidateSubjectDigest: canonicalDigest({ subject: 1 }), readinessBinding: null,
    reservation: createStandardReviewReservation({ candidateId, sourceId: "delegated-agent", target: {
      kind: "delivery", repository: "owner/repo", workUnitId: "example", planId: vehicle.planId },
    obligation: projectStandardReviewObligation(resolveReviewRouting({}).decision) }),
    changeRequest: { repository: "owner/repo", pullRequest: 42 } }, 2);
  return { ...h, primary, vehicle, subject, decisions, invocation, inFlight, boundary };
}

it.each(["known", "unknown"])("resolves a %s author and pass basis without rewriting the member decision", async provenance => {
  const h = await fixture();
  const recorded = await h.decisions.create({ ...terminusDecision(), subject: h.subject,
    decidedBy: provenance === "known" ? "original-owner" : null });
  const key = reviewDecisionKey(recorded.value), before = await h.store.version();
  const boundary = { ...h.boundary, deliveryReviewTermini: [{ vehicle: h.vehicle, terminus: key }] };
  expect(await readStoredDeliveryReviewMemberTermini(boundary, h.inFlight)).toEqual([{ vehicle: h.vehicle, terminus: {
    schemaVersion: 2, semanticsVersion: "review-terminus/v2", kind: "owner-accepted", lane: "standard",
    decisionKey: key, acceptedBy: recorded.value.decidedBy, completedPasses: 2 } }]);
  expect(await h.decisions.read(key)).toEqual(recorded);
  expect(await h.store.version()).toEqual(before);
});

it.each(["missing", "wrong-kind", "wrong-head", "withdrawn"] as const)("refuses a %s member reference and resolves after repair", async condition => {
  const h = await fixture();
  const live = await h.decisions.create({ ...terminusDecision(), subject: h.subject });
  const liveKey = reviewDecisionKey(live.value);
  let key = canonicalDigest({ missing: true });
  if (condition === "wrong-kind") key = reviewDecisionKey((await h.decisions.create({ ...extraPassDecision(), subject: h.subject })).value);
  if (condition === "wrong-head") key = reviewDecisionKey((await h.decisions.create({ ...terminusDecision(),
    subject: { ...h.subject, headSha: "b".repeat(40) } })).value);
  if (condition === "withdrawn") {
    key = liveKey;
    await h.decisions.create({ ...live.value, choice: { kind: "withdrawal", decisionKey: key }, basis: null });
  }
  const selected = (terminus: typeof key) => ({ ...h.boundary, deliveryReviewTermini: [{ vehicle: h.vehicle, terminus }] });
  await expect(readStoredDeliveryReviewMemberTermini(selected(key), h.inFlight)).rejects.toThrow(/terminus reference.*retry/i);
  const repaired = condition === "withdrawn" ? await h.decisions.create({ ...live.value,
    decidedAt: "2026-10-20T16:00:00Z", decidedBy: "current-owner" }) : live;
  const before = await h.store.version();
  expect(await readStoredDeliveryReviewMemberTermini(selected(reviewDecisionKey(repaired.value)), h.inFlight))
    .toMatchObject([{ vehicle: h.vehicle, terminus: { decisionKey: reviewDecisionKey(repaired.value), completedPasses: 2 } }]);
  expect(await h.store.version()).toEqual(before);
});

it("leaves no member decision after a refused boundary batch, then records and replays the repaired acceptance", async () => {
  const h = await fixture();
  await h.seedBoundary(h.primary.reference.owner, h.boundary);
  const access = { store: h.store, owner: h.primary.reference.owner };
  const before = await readSubmissionBoundaryVersioned(h.invocation.cwd, "example", access);
  const offer = DeliveryReviewTerminusOfferSchema.parse({ schemaVersion: 1, kind: "delivery-member-owner-terminus",
    workUnitId: "example", remote: "origin", expectedBoundaryVersion: before.version, candidateId: h.boundary.candidateId,
    candidateSubjectDigest: h.boundary.candidateSubjectDigest, vehicle: h.vehicle,
    target: { repository: "owner/repo", pullRequest: 42, headSha: h.vehicle.head }, completedPasses: 2,
    interactionText: "Accept this exact completed member review." });
  let conflict = true;
  const dependencies = { ...createNativeMemberTerminusBindings(() => h.invocation),
    readBoundary: () => readSubmissionBoundaryVersioned(h.invocation.cwd, "example", access),
    readOwnerAuthority: async () => ({ status: "authorized" as const, ownerIdentity: "original-owner" }),
    readCurrentOffer: async () => offer,
    writeBoundary: async (boundary: PublishedIntegrationBoundaryLocus, expectedVersion: string, put?: ReviewFactPut) => {
      if (put === undefined) throw new Error("Expected the fresh member decision in the boundary batch");
      try {
        await persistNativeTerminusBoundary(h.invocation, boundary, conflict ? "outdated-boundary-version" : expectedVersion, put);
        return { status: "written" as const };
      } catch (error) {
        if (error instanceof SubmissionBoundaryVersionConflictError) return { status: "version-conflict" as const };
        throw error;
      }
    } };
  const request = { schemaVersion: 1 as const, offer, judgment: { mode: "owner-accepted" as const } };
  expect(await resolveDeliveryReviewTerminusAcceptance(request, dependencies)).toMatchObject({ state: "refused", reason: "stale-offer" });
  expect(await h.decisions.list()).toMatchObject({ status: "complete", records: [] });
  expect(await readSubmissionBoundaryVersioned(h.invocation.cwd, "example", access)).toEqual(before);
  conflict = false;
  const accepted = await resolveDeliveryReviewTerminusAcceptance(request, dependencies);
  expect(accepted).toMatchObject({ state: "recorded", nextAction: "continue", record: { terminus: { acceptedBy: "original-owner", completedPasses: 2 } } });
  expect(accepted).not.toHaveProperty("boundaryPath");
  const version = await h.store.version();
  expect(await resolveDeliveryReviewTerminusAcceptance(request, dependencies)).toMatchObject({ state: "exact-replay", nextAction: "continue" });
  expect(await resolveDeliveryReviewTerminusAcceptance({ ...request, offer: { ...offer, completedPasses: 3 } }, dependencies))
    .toMatchObject({ state: "refused", reason: "record-conflict" });
  expect(await h.decisions.list()).toMatchObject({ status: "complete", records: [expect.anything()] });
  expect(await h.store.version()).toEqual(version);
});
