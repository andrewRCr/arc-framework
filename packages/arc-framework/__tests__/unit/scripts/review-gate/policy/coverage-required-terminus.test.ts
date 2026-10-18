/** Owner acceptance at incomplete coverage waits only for the terminal's required response. */
import { describe, expect, it } from "vitest";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { cleanHostedResult } from "../../../../fixtures/review-response-proof.js";

function request(outcome: "clean" | "findings", responseDue: boolean) {
  const producer = cleanHostedResult();
  if (producer.kind !== "hosted") throw new Error("expected hosted producer");
  return { schemaVersion: 1, target: producer.hostedTarget, lane: "standard", sources: ["delegated-agent"],
    standardReview: { obligation: producer.requirement.obligation, reasons: producer.requirement.reasons,
      rubricVersion: producer.requirement.rubricVersion, rubricDigest: producer.requirement.rubricDigest,
      retrigger: "full-final", count: 1 },
    completedPasses: 2, maxPasses: 2,
    attempts: [{ sourceId: "delegated-agent", outcome, reviewOperationId: "local/fix-check" }],
    verifiedTerminalSignal: { reviewOperationId: "local/fix-check", confirmedFindingCount: outcome === "clean" ? 0 : 1,
      maxConfirmedSeverity: outcome === "clean" ? null : "major", materialFix: outcome === "findings", coverageAdequate: false },
    nextPassContext: { convergence: outcome === "clean" ? "converged" : "unconverged", responseDue, incremental: null },
    terminus: { schemaVersion: 1, semanticsVersion: "review-terminus/v1", kind: "owner-accepted", lane: "standard",
      acceptedBy: "andrew", completedPasses: 2 },
  };
}

describe("Owner terminus at coverage-required", () => {
  it.each(["clean", "findings"] as const)("honors acceptance after a %s fix check's response is settled", outcome => {
    expect(resolveReviewPolicy(request(outcome, false))).toMatchObject({ state: "owner-accepted", nextAction: "none",
      payload: { consumedPass: false, terminus: { acceptedBy: "andrew" } } });
  });
  it("keeps an unperformed response ahead of Owner acceptance", () => {
    expect(resolveReviewPolicy(request("findings", true))).toMatchObject({ state: "coverage-required",
      nextAction: "select-coverage", payload: { responseRequired: true } });
  });
  it("continues refusing acceptance on the frontline lane", () => {
    const { nextPassContext: _context, ...standard } = request("clean", false); void _context;
    expect(() => resolveReviewPolicy({ ...standard, lane: "frontline", frontlineActive: true }))
      .toThrow(/owner-accepted terminus.*standard lane/i);
  });
});
