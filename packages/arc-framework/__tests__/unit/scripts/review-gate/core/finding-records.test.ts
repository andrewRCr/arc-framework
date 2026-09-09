import { describe, expect, it } from "vitest";

import {
  FindingSettlementV2Schema,
  NormalizedReviewFindingSchema,
  normalizeProviderFindingClassification,
} from "../../../../../src/scripts/review-gate/core/finding-records.js";
import {
  DispositionReportItemSchema,
} from "../../../../../src/scripts/review-gate/core/disposition-records.js";

describe("provider finding classification", () => {
  it.each([
    ["critical", "critical"],
    ["high", "major"],
    ["medium", "major"],
    ["low", "minor"],
    ["info", "minor"],
  ] as const)("normalizes provider severity %s to ARC severity %s", (providerSeverity, expectedSeverity) => {
    expect(normalizeProviderFindingClassification(providerSeverity, false)).toEqual({
      severity: expectedSeverity,
    });
  });

  it("retains pure-polish classification only on normalized minor findings", () => {
    expect(normalizeProviderFindingClassification("info", true)).toEqual({ severity: "minor", nit: true });
    expect(normalizeProviderFindingClassification("critical", true)).toEqual({ severity: "critical" });
  });

  it("accepts critical and rejects retired blocker across normalized findings and settlements", () => {
    const finding = {
      findingId: "finding-1",
      severity: "critical",
      locus: "src/review.ts:42",
      evidenceUrlOrId: "review:finding-1",
    };
    expect(NormalizedReviewFindingSchema.safeParse(finding).success).toBe(true);
    expect(NormalizedReviewFindingSchema.safeParse({ ...finding, severity: "blocker" }).success).toBe(false);

    const targetId = `sha256:${"a".repeat(64)}`;
    const dispositionSetId = `sha256:${"b".repeat(64)}`;
    const settlement = {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId,
      dispositionSetId,
      approval: {
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId,
        dispositionSetId,
        approvedBy: "maintainer-1",
        approvedAt: "2026-07-23T15:00:00Z",
      },
      findingId: "finding-1",
      sourceIdentity: "delegated-agent",
      severity: "critical",
      disposition: "defer",
      rationale: "The finding remains valid and is durably deferred.",
      settledBy: "maintainer-1",
      settledAt: "2026-07-23T15:01:00Z",
      fixTargetId: null,
      fixConsumption: null,
      verificationRefs: ["review:finding-1"],
    };
    expect(FindingSettlementV2Schema.safeParse(settlement).success).toBe(true);
    expect(FindingSettlementV2Schema.safeParse({ ...settlement, severity: "blocker" }).success).toBe(false);
  });

  function dispositionItem(overrides: Record<string, unknown> = {}) {
    return {
      findingId: "finding-1",
      sourceIdentity: "delegated-agent",
      locus: "src/review.ts:42",
      sourceVerification: "verified",
      verificationRefs: ["review:finding-1"],
      reportedSeverity: "major",
      verifiedSeverity: "major",
      disposition: "defer",
      gating: "blocking",
      rationale: "The source confirms the boundary issue.",
      recommendation: "Track the correction as follow-up work.",
      openQuestions: [],
      ...overrides,
    };
  }

  it.each(["reportedSeverity", "verifiedSeverity"] as const)(
    "rejects retired blocker in disposition grade field %s",
    (field) => {
      const item = dispositionItem();
      expect(DispositionReportItemSchema.safeParse(item).success).toBe(true);
      expect(DispositionReportItemSchema.safeParse({ ...item, [field]: "blocker" }).success).toBe(false);
    },
  );

  it("requires an explicit verified grade for supported findings", () => {
    const { verifiedSeverity, ...withoutVerifiedSeverity } = dispositionItem();
    void verifiedSeverity;
    expect(DispositionReportItemSchema.safeParse(withoutVerifiedSeverity).success).toBe(false);
    expect(DispositionReportItemSchema.safeParse({
      ...withoutVerifiedSeverity,
      verifiedSeverity: null,
    }).success).toBe(false);
  });

  it("keeps unsupported observations ungraded, rejected, and record-only", () => {
    const unsupported = dispositionItem({
      sourceVerification: "not-supported",
      reportedSeverity: "critical",
      verifiedSeverity: null,
      disposition: "reject",
      gating: "record-only",
    });
    expect(DispositionReportItemSchema.safeParse(unsupported).success).toBe(true);
    expect(DispositionReportItemSchema.safeParse({ ...unsupported, verifiedSeverity: "critical" }).success).toBe(false);
    expect(DispositionReportItemSchema.safeParse({ ...unsupported, verifiedNit: true }).success).toBe(false);
    expect(DispositionReportItemSchema.safeParse({ ...unsupported, disposition: "defer" }).success).toBe(false);
    expect(DispositionReportItemSchema.safeParse({ ...unsupported, gating: "blocking" }).success).toBe(false);
  });

  it("validates reported and verified nit markers independently", () => {
    expect(DispositionReportItemSchema.safeParse(dispositionItem({
      reportedSeverity: "minor",
      reportedNit: true,
      verifiedSeverity: "major",
    })).success).toBe(true);
    expect(DispositionReportItemSchema.safeParse(dispositionItem({
      reportedSeverity: "major",
      verifiedSeverity: "minor",
      verifiedNit: true,
      gating: "record-only",
    })).success).toBe(true);
    expect(DispositionReportItemSchema.safeParse(dispositionItem({ reportedNit: true })).success).toBe(false);
    expect(DispositionReportItemSchema.safeParse(dispositionItem({ verifiedNit: true })).success).toBe(false);
  });
});
