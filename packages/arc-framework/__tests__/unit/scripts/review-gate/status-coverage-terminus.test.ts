/** Exact delivery Owner acceptance remains reachable after settled material fixes. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../src/lib/delivery/review-vehicle.js";
import { createHostedHandleFixture } from "../../../fixtures/hosted-review.js";
import { hostedLaneAttemptId } from "../../../../src/scripts/review-gate/hosted/request.js";
import { projectHostedCorrectionCoverageSelection } from "../../../../src/scripts/review-gate/policy/hosted-coverage-selection.js";
import { resolveReviewPolicy } from "../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { createStandardReviewReservation, projectPublicationBoundary } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { resolveDeliveryReviewTerminusAcceptance, type DeliveryReviewTerminusAcceptanceAction } from "../../../../src/scripts/review-gate/policy/delivery-review-terminus.js";
import { bindDeliveryReviewTerminusOffer, composeDeliveryReviewObligation, resolveReviewStatus }
  from "../../../../src/scripts/review-gate/status.js";

const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member",
  planId: "123e4567-e89b-42d3-a456-426614174000", deliverableId: canonicalDigest({ member: 1 }),
  workUnitId: "example", head: "c".repeat(40) });
const handle = createHostedHandleFixture({ provider: "codex-pr", vehicle,
  requestedCoverage: "incremental", effectiveCoverage: "incremental" });
const target = { repository: handle.target.repository, headRef: "delivery/example/first", headSha: handle.target.headSha };
const requirement = handle.admission.requirement;
const standardReview = { obligation: requirement.obligation, reasons: requirement.reasons,
  rubricVersion: requirement.rubricVersion, rubricDigest: requirement.rubricDigest,
  retrigger: requirement.retrigger, count: requirement.count };
const binding = { workUnitId: "example", expectedBoundaryVersion: canonicalDigest({ boundary: 1 }),
  candidateId: canonicalDigest({ candidate: 1 }), candidateSubjectDigest: canonicalDigest({ subject: 1 }) };
const targets = [{ ...handle.target, vehicle, position: 1, memberCount: 1, chunkKey: "first", title: "First" }];
const scope = { schemaVersion: 1 as const, predecessorProducerId: hostedLaneAttemptId(handle),
  predecessorHeadSha: handle.target.headSha, basisHeadSha: handle.target.headSha, headSha: handle.target.headSha,
  requiredFindings: [{ producerId: hostedLaneAttemptId(handle), findingId: "finding-1", locus: "source.ts:1" }] };
const nextPassContext = { completePasses: 0, convergence: "unconverged" as const, responseDue: false,
  incremental: { basis: "fix-check" as const, scope } };
const terminalPolicy = resolveReviewPolicy({ schemaVersion: 1, target: handle.target, lane: "standard", standardReview,
  sources: ["codex-pr", "delegated-agent"], maxPasses: 4, completedPasses: 1, nextPassContext,
  attempts: [{ sourceId: "codex-pr", outcome: "findings", reviewOperationId: hostedLaneAttemptId(handle) }],
  verifiedTerminalSignal: { reviewOperationId: hostedLaneAttemptId(handle), confirmedFindingCount: 1,
    maxConfirmedSeverity: "major", materialFix: true, coverageAdequate: false } });
const coverageSelectionAction = projectHostedCorrectionCoverageSelection({ sources: ["codex-pr", "delegated-agent"],
  nextPassContext, scope, predecessor: { attemptId: hostedLaneAttemptId(handle), logicalPass: 1, sourceId: "codex-pr",
    outcome: "settled-findings" }, completedPasses: 1, vehicle });
const discharge = { discharged: false, detail: "The material fixes require another look.", nextSource: null,
  terminalPolicyState: terminalPolicy.state, coverageSelectionAction, completedPasses: 1, completePasses: 0, passCeiling: 4,
  attemptHistory: [{ updatedAt: "2026-10-18T00:00:00Z", headSha: handle.target.headSha, sourceId: "codex-pr",
    outcome: "settled-findings", requestedCoverage: "incremental" as const, effectiveCoverage: "incremental" as const,
    findingCount: 1, settledFindingCount: 1 }] };
async function status(obligation: ReturnType<typeof composeDeliveryReviewObligation>) {
  return resolveReviewStatus({ target }, { observe: async () => ({ actualHeadSha: target.headSha,
    currentBaseOid: "b".repeat(40), baseContained: true, requiredChecks: "green", routedObligation: obligation }) });
}

type Discharge = Parameters<typeof composeDeliveryReviewObligation>[0]["discharges"][number];
async function boundStatus(current: Discharge) {
  return bindDeliveryReviewTerminusOffer(await status(composeDeliveryReviewObligation({ targets, discharges: [current],
    statusRoute: { kind: "work-unit", workUnitId: "example" } })), binding);
}
async function acceptStop(action: DeliveryReviewTerminusAcceptanceAction, current: Discharge,
  sources: readonly string[] = ["codex-pr", "delegated-agent"]) {
  const reservation = createStandardReviewReservation({ candidateId: binding.candidateId, sourceId: "codex-pr",
    sources, obligation: standardReview,
    target: { kind: "delivery", repository: target.repository, planId: vehicle.planId, workUnitId: "example" } });
  let boundary = projectPublicationBoundary({ workUnit: "example", branch: "feat/example", candidateId: binding.candidateId,
    candidateSubjectDigest: binding.candidateSubjectDigest, reservation,
    changeRequest: { repository: target.repository, pullRequest: handle.target.pullRequest } });
  const result = await resolveDeliveryReviewTerminusAcceptance({ ...action, judgment: { mode: "owner-accepted" } }, {
    readBoundary: async () => ({ boundary, version: binding.expectedBoundaryVersion }),
    readOwnerAuthority: async () => ({ status: "authorized", ownerIdentity: "andrew" }),
    readCurrentOffer: async () => { const fresh = await boundStatus(current);
      return "terminusAction" in fresh ? fresh.terminusAction?.offer ?? null : null; },
    writeBoundary: async next => { boundary = next; return { status: "written", path: "boundary.json" }; },
  });
  return { result, boundary };
}

it("offers the disclosed stop at settled coverage and discharges the exact member after acceptance", async () => {
  expect(terminalPolicy).toMatchObject({ state: "coverage-required", payload: { responseRequired: false } });
  const offered = bindDeliveryReviewTerminusOffer(await status(composeDeliveryReviewObligation({ targets, discharges: [discharge] })), binding);
  expect(offered).toMatchObject({ nextAction: "select-coverage", terminusAction: { offer: { completedPasses: 1, vehicle } } });
  if (!("terminusAction" in offered) || offered.terminusAction === undefined) throw new Error("expected Owner stop");
  expect(offered.terminusAction.offer.interactionText).toContain("not been re-examined");
  const { result, boundary } = await acceptStop(offered.terminusAction, discharge);
  expect(result).toMatchObject({ state: "recorded", record: { terminus: { acceptedBy: "andrew", completedPasses: 1 } } });
  if (boundary.locus !== "delivery-status-required") throw new Error("expected delivery boundary");
  for (const stopped of [discharge, { ...discharge, coverageSelectionAction: undefined }]) {
    await expect(status(composeDeliveryReviewObligation({ targets, discharges: [stopped],
      ownerTermini: boundary.deliveryReviewTermini }))).resolves.toMatchObject({ routedObligation: {
      state: "settled", conjunction: { members: [{ state: "discharged" }] } } });
  }
});

it("retains the stop beside the ranked complete request after a converged fix check", async () => {
  const admission = resolveReviewPolicy({ schemaVersion: 1, target: handle.target, lane: "standard", standardReview,
    sources: ["codex-pr", "delegated-agent"], maxPasses: 4, completedPasses: 2, attempts: [],
    nextPassContext: { completePasses: 1, convergence: "converged", responseDue: false, incremental: null } });
  const continued = { ...discharge, nextSource: "codex-pr", coverageSelectionAction: undefined,
    requestAdmission: admission, requestCoverage: "complete" as const, completedPasses: 2, completePasses: 1,
    attemptHistory: [{ ...discharge.attemptHistory[0]!, requestedCoverage: "complete" as const, effectiveCoverage: "complete" as const },
      { ...discharge.attemptHistory[0]!, sourceId: "delegated-agent", outcome: "clean", findingCount: 0, settledFindingCount: 0 }] };
  const result = bindDeliveryReviewTerminusOffer(await status(composeDeliveryReviewObligation({ targets,
    discharges: [continued] })), binding);
  expect(result).toMatchObject({ nextAction: "review-hosted-request", action: { provider: "codex-pr", coverage: "complete" },
    terminusAction: { offer: { vehicle, completedPasses: 2 } } });
  if (!("terminusAction" in result) || result.terminusAction === undefined) throw new Error("expected exact stop");
  expect(result.terminusAction.offer.interactionText).not.toContain("not been re-examined");
});

function sourceContinuation(configured: boolean): Discharge {
  const requestAdmission = resolveReviewPolicy({ schemaVersion: 1, target: handle.target, lane: "standard", standardReview,
    sources: configured ? ["codex-pr", "delegated-agent"] : ["codex-pr"], completedPasses: 1, maxPasses: 4, attempts: [],
    nextPassContext: { completePasses: 0, convergence: "unconverged", responseDue: false, incremental: null } });
  return { ...discharge, coverageSelectionAction: undefined, requestAdmission, requestCoverage: "complete",
    nextSource: configured ? "delegated-agent" : "codex-pr" };
}

it("makes the advertised Owner stop executable when the local source is unconfigured", async () => {
  const current = sourceContinuation(false);
  const offered = await boundStatus(current);
  expect(offered).toMatchObject({ state: "blocked", reason: "material-fix-local-source-unconfigured",
    terminusAction: { offer: { vehicle, completedPasses: 1 } }, remedy: { argv: ["arc", "review", "status", "--work-unit", "example"] } });
  if (!("terminusAction" in offered) || offered.terminusAction === undefined) throw new Error("expected executable stop");
  expect(offered.terminusAction.offer.interactionText).toContain("not been re-examined");
  const { result, boundary } = await acceptStop(offered.terminusAction, current, ["codex-pr"]);
  expect(result).toMatchObject({ state: "recorded" });
  if (boundary.locus !== "delivery-status-required") throw new Error("expected delivery boundary");
  expect(boundary.reservation.sources).toEqual(["codex-pr"]);
  await expect(status(composeDeliveryReviewObligation({ targets, discharges: [current],
    ownerTermini: boundary.deliveryReviewTermini }))).resolves.toMatchObject({ state: "settled", nextAction: "continue-reconcile",
    routedObligation: { conjunction: { members: [{ state: "discharged" }] } } });
});

it("resumes local review on the original route after configuring the missing source", async () => {
  const refused = await boundStatus(sourceContinuation(false));
  expect(refused).toMatchObject({ state: "blocked", reason: "material-fix-local-source-unconfigured",
    remedy: { argv: ["arc", "review", "status", "--work-unit", "example"] } });
  await expect(boundStatus(sourceContinuation(true))).resolves.toMatchObject({ nextAction: "review-local-prepare",
    action: { sourceId: "delegated-agent", vehicle, target: handle.target, pass: 2, requestedCoverage: "complete" } });
});
