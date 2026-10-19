/** Delivery status consumes local coverage choices without repeating a completed review. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../src/lib/delivery/review-vehicle.js";
import { createHostedHandleFixture } from "../../../fixtures/hosted-review.js";
import { hostedLaneAttemptId } from "../../../../src/scripts/review-gate/hosted/request.js";
import { projectHostedCorrectionCoverageSelection } from "../../../../src/scripts/review-gate/policy/hosted-coverage-selection.js";
import { resolveReviewPolicy } from "../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { composeDeliveryReviewObligation, resolveReviewStatus } from "../../../../src/scripts/review-gate/status.js";

const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member",
  planId: "123e4567-e89b-42d3-a456-426614174000", deliverableId: canonicalDigest({ member: 1 }),
  workUnitId: "example", head: "c".repeat(40) });
const predecessor = createHostedHandleFixture({ provider: "codex-pr", vehicle: { ...vehicle, head: "b".repeat(40) },
  target: { repository: "owner/repo", pullRequest: 42, headSha: "b".repeat(40) } });
const target = { ...predecessor.target, headSha: vehicle.head };
const publicTarget = { repository: target.repository, headRef: "delivery/example/first", headSha: target.headSha };
const requirement = predecessor.admission.requirement;
const standardReview = { obligation: requirement.obligation, reasons: requirement.reasons,
  rubricVersion: requirement.rubricVersion, rubricDigest: requirement.rubricDigest,
  retrigger: requirement.retrigger, count: requirement.count };
const scope = { schemaVersion: 1 as const, predecessorProducerId: hostedLaneAttemptId(predecessor),
  predecessorHeadSha: predecessor.target.headSha, basisHeadSha: predecessor.target.headSha, headSha: target.headSha,
  requiredFindings: [{ producerId: hostedLaneAttemptId(predecessor), findingId: "finding-1", locus: "source.ts:1" }] };
const nextPassContext = { completePasses: 1, convergence: "unconverged" as const, responseDue: false,
  incremental: { basis: "fix-check" as const, scope } };
const sources = ["codex-pr", "delegated-agent"];
const coverageSelectionAction = projectHostedCorrectionCoverageSelection({ sources, nextPassContext, scope, vehicle,
  predecessor: { attemptId: hostedLaneAttemptId(predecessor), logicalPass: 1, sourceId: predecessor.provider,
    outcome: "settled-findings" }, completedPasses: 1 });

it.each((["target", "work-unit"] as const).flatMap(route =>
  (["incremental", "complete"] as const).map(coverage => ({ route, coverage }))))(
  "infers the local source from $coverage coverage through the $route route", async ({ route, coverage }) => {
    const requestAdmission = resolveReviewPolicy({ schemaVersion: 1, target, lane: "standard", standardReview,
      sources, completedPasses: 1, maxPasses: 2, attempts: [], nextPassContext, chosenCoverage: coverage });
    const obligation = composeDeliveryReviewObligation({
      statusRoute: route === "target" ? { kind: "target", target: publicTarget }
        : { kind: "work-unit", workUnitId: vehicle.workUnitId },
      targets: [{ ...target, vehicle, position: 1, memberCount: 1, chunkKey: "first", title: "First member" }],
      discharges: [{ discharged: false, detail: "The material fix needs local review.", nextSource: null,
        coverageSelectionAction, correctionScope: scope, requestAdmission,
        completedPasses: 1, completePasses: 1, passCeiling: 2, attemptHistory: [] }],
      requestCoverage: coverage,
    });
    const result = await resolveReviewStatus({ target: publicTarget }, { observe: async () => ({
      actualHeadSha: target.headSha, currentBaseOid: "a".repeat(40), baseContained: true,
      requiredChecks: "green", routedObligation: obligation,
    }) });
    expect(result).toMatchObject({ nextAction: "review-local-prepare", action: {
      sourceId: "delegated-agent", requestedCoverage: coverage, target, vehicle, pass: 2,
    } });
    if (result.nextAction !== "review-local-prepare") throw new Error("expected the selected local request");
    if (coverage === "incremental") expect(result.action.correctionScope).toEqual(scope);
    else expect(result.action).not.toHaveProperty("correctionScope");
  });
