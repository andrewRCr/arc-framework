import { describe, expect, it } from "vitest";

import {
  NormalizedReviewFindingSchema,
  NormalizedReviewFindingsSchema,
  captureReviewFindingSourceLabel,
  escapeReviewFindingDisplayText,
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

  it("accepts critical and rejects retired blocker in normalized findings", () => {
    const finding = {
      findingId: "finding-1",
      severity: "critical",
      locus: "src/review.ts:42",
      evidenceUrlOrId: "review:finding-1",
      sourceOrdinal: 1,
    };
    expect(NormalizedReviewFindingSchema.safeParse(finding).success).toBe(true);
    expect(NormalizedReviewFindingSchema.safeParse({ ...finding, severity: "blocker" }).success).toBe(false);
  });

  it("requires one NFC spelling for finding identities before canonical hashing", () => {
    const finding = {
      findingId: "finding-\u00e9",
      severity: "major" as const,
      locus: "src/review.ts:42",
      evidenceUrlOrId: "review:finding",
      sourceOrdinal: 1,
    };

    expect(NormalizedReviewFindingSchema.safeParse(finding).success).toBe(true);
    expect(NormalizedReviewFindingSchema.safeParse({
      ...finding,
      findingId: "finding-e\u0301",
    }).success).toBe(false);
    expect(NormalizedReviewFindingSchema.safeParse({
      ...finding,
      recursFindingId: "finding-e\u0301",
    }).success).toBe(false);
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

describe("normalized finding navigation", () => {
  const finding = (sourceOrdinal: number) => ({
    findingId: `finding-${sourceOrdinal}`,
    severity: "major" as const,
    locus: `src/review.ts:${sourceOrdinal}`,
    evidenceUrlOrId: `review:finding-${sourceOrdinal}`,
    sourceOrdinal,
  });

  it("captures a provider title or first non-empty body line as a bounded Unicode label", () => {
    expect(captureReviewFindingSourceLabel({ title: "Provider title", body: "Body fallback" })).toEqual({
      sourceLabel: "Provider title",
    });
    expect(captureReviewFindingSourceLabel({ body: "\n\n**Actual heading**\nDetails" })).toEqual({
      sourceLabel: "**Actual heading**",
    });

    const exact = "😀".repeat(512);
    const clipped = captureReviewFindingSourceLabel({ body: `${exact}Z` });
    expect(Array.from(clipped.sourceLabel ?? "")).toHaveLength(512);
    expect(clipped).toEqual({ sourceLabel: exact, sourceLabelTruncated: true });
    expect(captureReviewFindingSourceLabel({ body: exact })).toEqual({ sourceLabel: exact });
  });

  it("escapes provider text as inert single-line display and validates truthful truncation metadata", () => {
    expect(escapeReviewFindingDisplayText("<script>*unsafe*\n[link](target)"))
      .toBe("&lt;script&gt;\\*unsafe\\* \\[link\\]\\(target\\)");

    expect(NormalizedReviewFindingSchema.safeParse({
      ...finding(1),
      sourceLabel: "x".repeat(512),
      sourceLabelTruncated: true,
    }).success).toBe(true);
    expect(NormalizedReviewFindingSchema.safeParse({
      ...finding(1),
      sourceLabel: "short",
      sourceLabelTruncated: true,
    }).success).toBe(false);
    expect(NormalizedReviewFindingSchema.safeParse({
      ...finding(1),
      sourceLabelTruncated: true,
    }).success).toBe(false);
    expect(NormalizedReviewFindingSchema.safeParse({
      ...finding(1),
      sourceLabel: "short",
      sourceLabelTruncated: false,
    }).success).toBe(false);
  });

  it("requires complete producer arrays to preserve one-based capture order", () => {
    expect(NormalizedReviewFindingsSchema.safeParse([finding(1), finding(2)]).success).toBe(true);
    expect(NormalizedReviewFindingsSchema.safeParse([finding(1), finding(1)]).success).toBe(false);
    expect(NormalizedReviewFindingsSchema.safeParse([finding(2)]).success).toBe(false);
    expect(NormalizedReviewFindingsSchema.safeParse([finding(2), finding(1)]).success).toBe(false);
  });
});
