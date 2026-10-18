/** Coverage selection after a performed material response on a delivery member. */
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../../src/lib/delivery/review-vehicle.js";
import type { EarlierHostedAttemptApplicabilityRead } from "../../../../../src/scripts/review-gate/policy/earlier-review-applicability.js";
import { projectHostedReservationDischarge } from "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { createHostedHandleFixture, createHostedTerminalAttemptFixture } from "../../../../fixtures/hosted-review.js";
import { hostedLaneAttemptId } from "../../../../../src/scripts/review-gate/hosted/request.js";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member",
  planId: "123e4567-e89b-42d3-a456-426614174000", deliverableId: canonicalDigest({ member: 1 }),
  workUnitId: "example", head: "c".repeat(40) });
const handle = createHostedHandleFixture({ provider: "codex-pr", vehicle });
const reservation = createStandardReviewReservation({ candidateId: canonicalDigest({ candidate: 1 }),
  sourceId: "codex-pr", sources: ["codex-pr", "delegated-agent"],
  target: { kind: "delivery", repository: handle.target.repository, planId: vehicle.planId, workUnitId: vehicle.workUnitId },
  obligation: { obligation: handle.admission.requirement.obligation, reasons: handle.admission.requirement.reasons,
    rubricVersion: handle.admission.requirement.rubricVersion, rubricDigest: handle.admission.requirement.rubricDigest,
    retrigger: handle.admission.requirement.retrigger, count: 1 } });
const headSha = "d".repeat(40);
const statusTarget = { repository: handle.target.repository, headRef: "delivery/example/first", headSha };
const scope = { schemaVersion: 1 as const, predecessorProducerId: hostedLaneAttemptId(handle),
  predecessorHeadSha: handle.target.headSha, basisHeadSha: handle.target.headSha, headSha,
  requiredFindings: [{ producerId: hostedLaneAttemptId(handle), findingId: "finding-1", locus: "large.ts:1" }] };

function fixture(route: "work-unit" | "target", proven = true) {
  return {
    reservation, span: [headSha],
    statusRoute: route === "work-unit" ? { kind: "work-unit" as const, workUnitId: "example" }
      : { kind: "target" as const, target: statusTarget },
    nextPassContext: { convergence: "unconverged" as const, responseDue: false,
      incremental: proven ? { basis: "fix-check" as const, scope } : null },
    target: { ...handle.target, headSha, baseRevision: handle.admission.reviewTarget.diffBaseSha,
      vehicle: { ...vehicle, head: headSha } },
    readLaneProgress: async () => ({ status: "unrecorded" as const }),
    readEarlierAttemptApplicability: async (sourceId: string): Promise<EarlierHostedAttemptApplicabilityRead> => sourceId === "codex-pr"
      ? { status: "complete", attempts: [{ operationId: "lane-prior", attemptId: scope.predecessorProducerId,
        logicalPass: 1, updatedAt: "2026-10-18T00:00:00Z", sourceId, outcome: "settled-findings",
        requestedCoverage: "complete", effectiveCoverage: "complete", scopeMode: "whole-target",
        producerTarget: handle.admission.reviewTarget, hosted: { handle, admission: handle.admission },
        applicability: "request-review" }] }
      : { status: "not-found" },
    resolveTerminalPolicy: async (): Promise<never> => { throw new Error("no current terminal"); },
    resolveEarlierTerminalPolicy: async (): Promise<never> => { throw new Error("no retained terminal policy"); },
    resolveIncrementalCorrectionScope: async () => proven ? scope : null,
  };
}

describe("delivery material-response coverage", () => {
  it.each(["work-unit", "target"] as const)("offers only local choices with the original %s status route", async route => {
    const result = await projectHostedReservationDischarge(fixture(route));
    expect(result).toMatchObject({ discharged: false, correctionScope: scope, coverageSelectionAction: {
      choices: [{ sourceId: "delegated-agent", coverage: "incremental" }, { sourceId: "delegated-agent", coverage: "complete" }],
    } });
    const text = result.coverageSelectionAction?.interactionText ?? "";
    expect(text).not.toContain("--json");
    expect(text).toContain(route === "work-unit" ? "--work-unit example" : `--target '${JSON.stringify(statusTarget)}'`);
    expect(text).toContain("--source delegated-agent --coverage incremental");
  });

  it("defaults an unproved material fix-check successor to local complete coverage without a selection", async () => {
    const input = fixture("target", false);
    const incremental = createHostedHandleFixture({ provider: "codex-pr", vehicle,
      requestedCoverage: "incremental", effectiveCoverage: "incremental" });
    const attemptId = hostedLaneAttemptId(incremental);
    const result = await projectHostedReservationDischarge({ ...input,
      readEarlierAttemptApplicability: async sourceId => {
        const earlier = await input.readEarlierAttemptApplicability(sourceId);
        return earlier.status !== "complete" ? earlier : { status: "complete", attempts: earlier.attempts.map(attempt => ({
          ...attempt, attemptId, applicability: "retain-prior-attempt", requestedCoverage: "incremental",
          effectiveCoverage: "incremental", producerTarget: incremental.admission.reviewTarget,
          hosted: { handle: incremental, admission: incremental.admission },
        })) };
      },
      resolveEarlierTerminalPolicy: async () => resolveReviewPolicy({ schemaVersion: 1,
        target: incremental.target, lane: "standard", standardReview: reservation.obligation,
        sources: reservation.sources, maxPasses: 4, completedPasses: 1,
        nextPassContext: input.nextPassContext,
        attempts: [{ sourceId: "codex-pr", outcome: "findings", reviewOperationId: attemptId }],
        verifiedTerminalSignal: { reviewOperationId: attemptId, confirmedFindingCount: 1,
          maxConfirmedSeverity: "major", materialFix: true, coverageAdequate: false },
      }),
    });
    expect(result).toMatchObject({ discharged: false, nextSource: "delegated-agent", requestCoverage: "complete" });
    expect(result).not.toHaveProperty("coverageSelectionAction");
  });
});

describe("converged fix-check continuation", () => {
  it.each(["current delivery", "retained delivery", "current singleton", "retained singleton"])(
    "admits ranked complete coverage without a selection for %s", async surface => {
      const member = surface.endsWith("delivery");
      const current = surface.startsWith("current");
      const incremental = createHostedHandleFixture({ provider: "codex-pr", ...(member ? { vehicle } : {}),
        requestedCoverage: "incremental", effectiveCoverage: "incremental" });
      const terminal = createHostedTerminalAttemptFixture({ admission: incremental.admission, outcome: "clean" });
      const nextPassContext = { convergence: "converged" as const, responseDue: false, incremental: null };
      const reserved = createStandardReviewReservation({ candidateId: canonicalDigest({ candidate: 1 }),
        sourceId: "codex-pr", sources: ["codex-pr", "delegated-agent"],
        ...(member ? { target: reservation.target } : { target: { kind: "pinned-head" as const,
          repository: incremental.target.repository, headSha: incremental.target.headSha } }),
        obligation: reservation.obligation });
      const resolveTerminal = async () => resolveReviewPolicy({ schemaVersion: 1, target: incremental.target,
        lane: "standard", standardReview: reserved.obligation, sources: reserved.sources, maxPasses: 4,
        completedPasses: 1, nextPassContext,
        attempts: [{ sourceId: "codex-pr", outcome: "clean", reviewOperationId: terminal.attemptId }],
        verifiedTerminalSignal: { reviewOperationId: terminal.attemptId, confirmedFindingCount: 0,
          maxConfirmedSeverity: null, materialFix: false, coverageAdequate: false } });
      const result = await projectHostedReservationDischarge({ reservation: reserved, nextPassContext,
        statusRoute: { kind: "work-unit", workUnitId: "example" }, span: [incremental.target.headSha],
        target: { ...incremental.target, ...(member ? { vehicle } : {}) },
        readLaneProgress: async () => current ? { status: "recorded", completedPasses: 1, completePasses: 0,
          attempts: [{ ...terminal, sourceId: "codex-pr", logicalPass: 1, outcome: "clean", scopeMode: "whole-target",
            headSha: incremental.target.headSha, ...(member ? { vehicle } : {}) }] } : { status: "unrecorded" },
        readEarlierAttemptApplicability: async sourceId => current || sourceId !== "codex-pr" ? { status: "not-found" }
          : { status: "complete", attempts: [{ operationId: "earlier-lane", attemptId: terminal.attemptId,
            sourceId, logicalPass: 1, outcome: "clean", updatedAt: "2026-10-18T00:00:00Z",
            requestedCoverage: "incremental", effectiveCoverage: "incremental", scopeMode: "whole-target",
            producerTarget: incremental.admission.reviewTarget, hosted: { handle: incremental, admission: incremental.admission },
            applicability: "retain-prior-attempt" }] },
        resolveTerminalPolicy: resolveTerminal, resolveEarlierTerminalPolicy: resolveTerminal,
      });
      expect(result).toMatchObject({ discharged: false, nextSource: "codex-pr", requestCoverage: "complete" });
      expect(result).not.toHaveProperty("coverageSelectionAction");
    });
});
