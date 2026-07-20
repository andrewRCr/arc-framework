import { z } from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  REVIEW_DURABLE_RECORD_INVENTORY,
} from "../../../../src/scripts/review-gate/core/schema-inventory.js";

import {
  FindingClassificationSchema,
  FindingDispositionSchema,
  ReviewSeveritySchema,
} from "../../../../src/scripts/review-gate/core/review-primitives.js";
import {
  ReviewAssuranceInputSchema,
  ReviewMethodActivitySchema,
  RoutingWorkClassSchema,
  WorkContextSchema,
  type ReviewAssuranceInput,
} from "../../../../src/scripts/review-gate/policy/assurance-schema.js";
import {
  IndependentAnalysisContractSchema,
} from "../../../../src/scripts/review-gate/policy/independent-analysis-schema.js";
import {
  ProjectRoutingPromotionSchema,
} from "../../../../src/scripts/review-gate/policy/project-promotion-schema.js";
import {
  AssuranceModeSchema,
  ChangeDeterminacySchema,
  ChangeSetStateSchema,
  CoreRoutingReasonSchema,
  FrontlineActionSchema,
  OwnershipRelationSchema,
  ReviewContentKindSchema,
  ReviewObligationSchema,
  ReviewRetriggerSchema,
  ReviewRiskSchema,
  ReviewRoutingDecisionSchema,
  ReviewRoutingFactsSchema,
  SurfaceAuthoritySchema,
  type ReviewRoutingFacts,
} from "../../../../src/scripts/review-gate/policy/routing-schema.js";

describe("review semantic schemas", () => {
  it.each([
    ReviewObligationSchema,
    FrontlineActionSchema,
    ReviewRetriggerSchema,
    AssuranceModeSchema,
    CoreRoutingReasonSchema,
    ChangeSetStateSchema,
    ReviewContentKindSchema,
    ReviewRiskSchema,
    ChangeDeterminacySchema,
    OwnershipRelationSchema,
    SurfaceAuthoritySchema,
    WorkContextSchema,
    RoutingWorkClassSchema,
  ])("accepts every member of a closed review-policy enum", (schema) => {
    for (const member of schema.options) expect(schema.parse(member)).toBe(member);
  });

  it.each(["blocker", "major", "minor"])("accepts severity %s", (severity) => {
    expect(ReviewSeveritySchema.parse(severity)).toBe(severity);
  });

  it.each(["fix", "defer", "reject"])("accepts disposition %s", (disposition) => {
    expect(FindingDispositionSchema.parse(disposition)).toBe(disposition);
  });

  it("permits nit only for minor findings", () => {
    expect(FindingClassificationSchema.parse({ severity: "minor", nit: true })).toEqual({
      severity: "minor",
      nit: true,
    });
    expect(FindingClassificationSchema.safeParse({ severity: "major", nit: true }).success).toBe(false);
  });

  it.each([
    ["unscoped", "none"],
    ["errand", "none"],
    ["work-unit", "Light"],
    ["work-unit", "Heavy"],
    ["work-unit", "Novel"],
  ])("accepts assurance pairing %s / %s", (workContext, workClass) => {
    expect(ReviewAssuranceInputSchema.parse({ workContext, workClass })).toEqual({ workContext, workClass });
  });

  it("accepts independently normalized activity and assurance facts", () => {
    expect(ReviewMethodActivitySchema.parse({ selfReview: true, frontlineReview: false })).toEqual({
      selfReview: true,
      frontlineReview: false,
    });
    expect(ReviewAssuranceInputSchema.parse({ workContext: "unscoped", workClass: "Heavy" })).toEqual({
      workContext: "unscoped",
      workClass: "Heavy",
    });
    expect(ReviewMethodActivitySchema.safeParse({
      selfReview: true,
      frontlineReview: false,
      hostedReview: true,
    }).success).toBe(false);
  });

  it("accepts the complete closed routing record and rejects arbitrary facts", () => {
    const facts = {
      schemaVersion: 1,
      changeSetState: "known",
      contentKind: "documentation",
      reviewRisk: "routine",
      changeDeterminacy: "atomic",
      ownership: "self",
      surfaceAuthority: "planning-grooming",
      assurance: { workContext: "work-unit", workClass: "Heavy" },
      activity: { selfReview: true, frontlineReview: false },
    };
    expect(ReviewRoutingFactsSchema.parse(facts)).toEqual(facts);
    expect(ReviewRoutingFactsSchema.safeParse({ ...facts, ciWeight: "light" }).success).toBe(false);
  });

  it("enforces independent-analysis and retrigger pairings", () => {
    const decision = {
      schemaVersion: 1,
      authorSelfReview: "recommended",
      frontlineAction: "skip",
      independentAnalysis: "exempt",
      retrigger: "none",
      assuranceMode: "terminal-aggregate",
      reasons: ["auto-eligible-planning"],
    };
    expect(ReviewRoutingDecisionSchema.parse(decision)).toEqual(decision);
    expect(ReviewRoutingDecisionSchema.safeParse({
      ...decision,
      independentAnalysis: "required",
    }).success).toBe(false);
    expect(ReviewRoutingDecisionSchema.safeParse({
      ...decision,
      independentAnalysis: "exempt",
      retrigger: "incremental",
    }).success).toBe(false);
    expect(ReviewRoutingDecisionSchema.safeParse({ ...decision, reasons: [] }).success).toBe(false);
  });

  it("preserves project reason namespaces without accepting fact extensions", () => {
    const promotion = {
      schemaVersion: 1,
      policyId: "self-hosting",
      independentAnalysis: "required",
      reasons: ["project:self-hosting:heavy-class"],
    };
    expect(ProjectRoutingPromotionSchema.parse(promotion)).toEqual(promotion);
    expect(ProjectRoutingPromotionSchema.safeParse({ ...promotion, facts: { class: "Heavy" } }).success).toBe(false);
    expect(ProjectRoutingPromotionSchema.safeParse({
      ...promotion,
      reasons: ["project:other:heavy-class"],
    }).success).toBe(false);
  });

  it("validates the logical independent-analysis contract", () => {
    const contract = {
      version: "independent-analysis/v1",
      coverage: "complete-exact-change-set",
      evaluatorBoundary: "independent-source-and-context",
      rubric: { version: "implementation-audit/v1", digest: `sha256:${"a".repeat(64)}` },
      findingFloor: "actionable-source-grounded",
      cleanRule: "all-rubric-dimensions-considered",
    };
    expect(IndependentAnalysisContractSchema.parse(contract)).toEqual(contract);
    expect(IndependentAnalysisContractSchema.safeParse({ ...contract, partial: true }).success).toBe(false);
  });

  it("exports schema-inferred structural types", () => {
    expectTypeOf<ReviewAssuranceInput>().toEqualTypeOf<z.infer<typeof ReviewAssuranceInputSchema>>();
    expectTypeOf<ReviewRoutingFacts>().toEqualTypeOf<z.infer<typeof ReviewRoutingFactsSchema>>();
  });

  it("inventories every planned durable record under one stable identity", () => {
    expect(REVIEW_DURABLE_RECORD_INVENTORY).toEqual([
      { id: "review-target", version: 2, owner: "gate-contract" },
      { id: "review-requirement", version: 2, owner: "gate-contract" },
      { id: "review-request", version: 2, owner: "gate-contract" },
      { id: "review-receipt", version: 2, owner: "gate-contract" },
      { id: "review-applicability", version: 2, owner: "gate-contract" },
      { id: "normalized-finding", version: 2, owner: "finding-settlement" },
      { id: "disposition-set", version: 2, owner: "finding-settlement" },
      { id: "fix-authorization", version: 2, owner: "finding-settlement" },
      { id: "fix-consumption", version: 2, owner: "finding-settlement" },
      {
        id: "review-operation-state",
        version: 1,
        owner: "operation-state",
        variants: ["frontline-run", "review-suspension"],
      },
    ]);
    expect(new Set(REVIEW_DURABLE_RECORD_INVENTORY.map(({ id }) => id)).size)
      .toBe(REVIEW_DURABLE_RECORD_INVENTORY.length);
  });
});
