import { z } from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import { assertSchemaRefuses } from "../../../helpers/schema-assertion.js";

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
  StandardReviewContractSchema,
} from "../../../../src/scripts/review-gate/policy/standard-review-schema.js";
import {
  STANDARD_REVIEW_BASELINE_CONTRACT,
} from "../../../../src/scripts/review-gate/policy/standard-review.js";
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

  it.each(["critical", "major", "minor"])("accepts severity %s", (severity) => {
    expect(ReviewSeveritySchema.parse(severity)).toBe(severity);
  });

  it("rejects the retired ARC-owned blocker severity", () => {
    assertSchemaRefuses(ReviewSeveritySchema, "blocker");
  });

  it.each(["fix", "defer", "reject"])("accepts disposition %s", (disposition) => {
    expect(FindingDispositionSchema.parse(disposition)).toBe(disposition);
  });

  it("permits nit only for minor findings", () => {
    expect(FindingClassificationSchema.parse({ severity: "minor", nit: true })).toEqual({
      severity: "minor",
      nit: true,
    });
    assertSchemaRefuses(FindingClassificationSchema, { severity: "major", nit: true });
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
    assertSchemaRefuses(ReviewMethodActivitySchema, {
      selfReview: true,
      frontlineReview: false,
      hostedReview: true,
    });
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
    assertSchemaRefuses(ReviewRoutingFactsSchema, { ...facts, ciWeight: "light" });
    assertSchemaRefuses(ReviewRoutingFactsSchema, {
      ...facts,
      reviewRubric: "implementation-audit",
    });
  });

  it("enforces standard-review and retrigger pairings", () => {
    const decision = {
      schemaVersion: 1,
      authorSelfReview: "recommended",
      frontlineAction: "skip",
      standardReview: "exempt",
      retrigger: "none",
      assuranceMode: "terminal-aggregate",
      reasons: ["auto-eligible-planning"],
    };
    expect(ReviewRoutingDecisionSchema.parse(decision)).toEqual(decision);
    assertSchemaRefuses(ReviewRoutingDecisionSchema, {
      ...decision,
      standardReview: "required",
    });
    assertSchemaRefuses(ReviewRoutingDecisionSchema, {
      ...decision,
      standardReview: "exempt",
      retrigger: "incremental",
    });
    assertSchemaRefuses(ReviewRoutingDecisionSchema, { ...decision, reasons: [] });
  });

  it("preserves project reason namespaces without accepting fact extensions", () => {
    const promotion = {
      schemaVersion: 1,
      policyId: "self-hosting",
      standardReview: "required",
      reasons: ["project:self-hosting:heavy-class"],
    };
    expect(ProjectRoutingPromotionSchema.parse(promotion)).toEqual(promotion);
    assertSchemaRefuses(ProjectRoutingPromotionSchema, { ...promotion, facts: { class: "Heavy" } });
    assertSchemaRefuses(ProjectRoutingPromotionSchema, {
      ...promotion,
      reasons: ["project:other:heavy-class"],
    });
  });

  it("validates the logical standard-review contract", () => {
    const contract = STANDARD_REVIEW_BASELINE_CONTRACT;
    expect(StandardReviewContractSchema.parse(contract)).toEqual(contract);
    assertSchemaRefuses(StandardReviewContractSchema, { ...contract, partial: true });
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
      { id: "review-receipt-ledger", version: 2, owner: "receipt-store" },
      { id: "normalized-finding", version: 2, owner: "finding-settlement" },
      { id: "disposition-set", version: 2, owner: "finding-settlement" },
      { id: "fix-authorization", version: 2, owner: "finding-settlement" },
      { id: "fix-consumption", version: 2, owner: "finding-settlement" },
      { id: "local-review-source", version: 1, owner: "local-source" },
      { id: "approved-disposition-record", version: 1, owner: "advisory-records" },
      { id: "frontline-outcome-record", version: 1, owner: "advisory-records" },
      { id: "review-reduction-projection", version: 1, owner: "advisory-records" },
      {
        id: "review-operation-state",
        version: 1,
        owner: "operation-state",
        variants: ["frontline-run", "frontline-phase", "review-suspension", "local-review", "lane-progress"],
      },
    ]);
    expect(new Set(REVIEW_DURABLE_RECORD_INVENTORY.map(({ id }) => id)).size)
      .toBe(REVIEW_DURABLE_RECORD_INVENTORY.length);
  });
});
