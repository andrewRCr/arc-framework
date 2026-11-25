/** Frozen producer output keeps stored review contracts separate from method-file names. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalDigest, createKernelRegistry } from "../../../../src/lib/kernel/index.js";
import { ReviewRequirementV2Schema } from "../../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import { registerReviewDomainSchemas } from "../../../../src/scripts/review-gate/core/register-review-schemas.js";
import { ReviewMethodActivitySchema } from "../../../../src/scripts/review-gate/policy/assurance-schema.js";
import { FrontlineExecutionOutcomeSchema } from "../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import {
  createStandardReviewReservation, RunSelfReviewActionSchema, StandardReviewReservationV1Schema,
} from "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { ProjectRoutingPromotionSchema } from "../../../../src/scripts/review-gate/policy/project-promotion-schema.js";
import { ReviewRoutingDecisionSchema } from "../../../../src/scripts/review-gate/policy/routing-schema.js";
import { StandardReviewGuidanceProjectionSchema } from
  "../../../../src/scripts/review-gate/policy/standard-review-guidance.js";
import { deriveStandardReviewRubricIdentity } from "../../../../src/scripts/review-gate/policy/standard-review.js";
import { StandardReviewContractSchema } from "../../../../src/scripts/review-gate/policy/standard-review-schema.js";
import { ReviewResolveEnvelopeSchema, resolveReviewPolicy } from "../../../../src/scripts/review-gate/policy/review-policy-driver.js";

// Captured from public target, requirement, routing, outcome, reservation, and guidance constructors.
const records = JSON.parse(readFileSync(resolve(import.meta.dirname,
  "../../../fixtures/review-retained-contracts/records.json"), "utf8")) as Record<string, unknown>;
const schemas = [
  ["standard-contract", StandardReviewContractSchema],
  ["requirement", ReviewRequirementV2Schema],
  ["frontline-outcome", FrontlineExecutionOutcomeSchema],
  ["reservation", StandardReviewReservationV1Schema],
  ["guidance", StandardReviewGuidanceProjectionSchema],
  ["activity", ReviewMethodActivitySchema],
  ["routing", ReviewRoutingDecisionSchema],
  ["promotion", ProjectRoutingPromotionSchema],
  ["author-action", RunSelfReviewActionSchema],
  ["boundary-resolve", ReviewResolveEnvelopeSchema],
] as const;

describe("retained review contracts", () => {
  it.each(schemas)("parses the stored %s without changing its literals or fields", (name, schema) => {
    expect(schema.parse(records[name])).toEqual(records[name]);
  });

  it("preserves the rubric and reservation identity preimages", () => {
    const reservation = StandardReviewReservationV1Schema.parse(records.reservation);
    expect(deriveStandardReviewRubricIdentity(records["standard-contract"])).toEqual({
      version: "standard-review/v1", digest: reservation.obligation.rubricDigest,
    });
    expect(createStandardReviewReservation({
      candidateId: canonicalDigest({ candidate: "example" }),
      sourceId: reservation.sources[0]!,
      target: reservation.target,
      obligation: reservation.obligation,
    })).toEqual(reservation);
  });

  it.each([
    { outcome: "clean", coverageAdequate: true, materialFix: false, state: "pass-complete" },
    { outcome: "findings", coverageAdequate: true, materialFix: true, state: "findings" },
    { outcome: "clean", coverageAdequate: false, materialFix: false, state: "coverage-required" },
  ])("keeps terminal coverage internal in the $state boundary policy", ({ outcome, coverageAdequate, materialFix, state }) => {
    const reservation = StandardReviewReservationV1Schema.parse(records.reservation);
    const result = resolveReviewPolicy({ schemaVersion: 1, lane: "standard", frontlineActive: false,
      target: { repository: "owner/repo", pullRequest: 42, headSha: "a".repeat(40) },
      standardReview: reservation.obligation, sources: ["delegated-agent"], maxPasses: 2, completedPasses: 1,
      attempts: [{ sourceId: "delegated-agent", outcome, reviewOperationId: "retained-review" }],
      nextPassContext: { completePasses: 1, convergence: materialFix ? "unconverged" : "converged",
        responseDue: materialFix, incremental: null },
      verifiedTerminalSignal: { reviewOperationId: "retained-review", confirmedFindingCount: materialFix ? 1 : 0,
        maxConfirmedSeverity: materialFix ? "major" : null, materialFix, coverageAdequate,
        effectiveCoverage: coverageAdequate ? "complete" : "incremental" },
    });
    expect(result.state).toBe(state);
    expect(result.payload).toHaveProperty("verifiedTerminalSignal");
    expect(result.payload).not.toHaveProperty("verifiedTerminalSignal.effectiveCoverage");
    if (state === "pass-complete") expect(result).toEqual(records["boundary-resolve"]);
  });

  it("keeps the published review schema identifiers", () => {
    const registry = registerReviewDomainSchemas(createKernelRegistry());
    for (const id of [
      "standard-review-contract", "standard-review-rubric-digest-preimage", "standard-review-obligation-projection",
      "review-method-activity", "review-routing-decision", "project-routing-promotion", "frontline-execution-outcome",
    ]) expect(registry.get(id)).toBeDefined();
  });
});
