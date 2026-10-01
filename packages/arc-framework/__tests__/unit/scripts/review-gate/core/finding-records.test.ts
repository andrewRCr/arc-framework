import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";

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
    assertSchemaAccepts(NormalizedReviewFindingSchema, finding);
    assertSchemaRefuses(NormalizedReviewFindingSchema, { ...finding, severity: "blocker" });
  });

  it("requires one NFC spelling for finding identities before canonical hashing", () => {
    const finding = {
      findingId: "finding-\u00e9",
      severity: "major" as const,
      locus: "src/review.ts:42",
      evidenceUrlOrId: "review:finding",
      sourceOrdinal: 1,
    };

    assertSchemaAccepts(NormalizedReviewFindingSchema, finding);
    assertSchemaRefuses(NormalizedReviewFindingSchema, {
      ...finding,
      findingId: "finding-e\u0301",
    });
    assertSchemaRefuses(NormalizedReviewFindingSchema, {
      ...finding,
      recursFindingId: "finding-e\u0301",
    });
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
      assertSchemaAccepts(DispositionReportItemSchema, item);
      assertSchemaRefuses(DispositionReportItemSchema, { ...item, [field]: "blocker" });
    },
  );

  it("requires an explicit verified grade for supported findings", () => {
    const { verifiedSeverity, ...withoutVerifiedSeverity } = dispositionItem();
    void verifiedSeverity;
    assertSchemaRefuses(DispositionReportItemSchema, withoutVerifiedSeverity);
    assertSchemaRefuses(DispositionReportItemSchema, {
      ...withoutVerifiedSeverity,
      verifiedSeverity: null,
    });
  });

  it("keeps unsupported observations ungraded, rejected, and record-only", () => {
    const unsupported = dispositionItem({
      sourceVerification: "not-supported",
      reportedSeverity: "critical",
      verifiedSeverity: null,
      disposition: "reject",
      gating: "record-only",
    });
    assertSchemaAccepts(DispositionReportItemSchema, unsupported);
    assertSchemaRefuses(DispositionReportItemSchema, { ...unsupported, verifiedSeverity: "critical" });
    assertSchemaRefuses(DispositionReportItemSchema, { ...unsupported, verifiedNit: true });
    assertSchemaRefuses(DispositionReportItemSchema, { ...unsupported, disposition: "defer" });
    assertSchemaRefuses(DispositionReportItemSchema, { ...unsupported, gating: "blocking" });
  });

  it("validates reported and verified nit markers independently", () => {
    assertSchemaAccepts(DispositionReportItemSchema, dispositionItem({
      reportedSeverity: "minor",
      reportedNit: true,
      verifiedSeverity: "major",
    }));
    assertSchemaAccepts(DispositionReportItemSchema, dispositionItem({
      reportedSeverity: "major",
      verifiedSeverity: "minor",
      verifiedNit: true,
      gating: "record-only",
    }));
    assertSchemaRefuses(DispositionReportItemSchema, dispositionItem({ reportedNit: true }));
    assertSchemaRefuses(DispositionReportItemSchema, dispositionItem({ verifiedNit: true }));
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
    expect(captureReviewFindingSourceLabel({ body: `${" ".repeat(513)}Visible heading` })).toEqual({});
  });

  it("escapes provider text as inert single-line display and validates truthful truncation metadata", () => {
    expect(escapeReviewFindingDisplayText("<script>*unsafe*\n[link](target)"))
      .toBe("&lt;script&gt;\\*unsafe\\* \\[link\\]\\(target\\)");

    assertSchemaAccepts(NormalizedReviewFindingSchema, {
      ...finding(1),
      sourceLabel: "x".repeat(512),
      sourceLabelTruncated: true,
    });
    assertSchemaRefuses(NormalizedReviewFindingSchema, {
      ...finding(1),
      sourceLabel: "short",
      sourceLabelTruncated: true,
    });
    assertSchemaRefuses(NormalizedReviewFindingSchema, {
      ...finding(1),
      sourceLabelTruncated: true,
    });
    assertSchemaRefuses(NormalizedReviewFindingSchema, {
      ...finding(1),
      sourceLabel: "short",
      sourceLabelTruncated: false,
    });
  });

  it("requires complete producer arrays to preserve one-based capture order", () => {
    assertSchemaAccepts(NormalizedReviewFindingsSchema, [finding(1), finding(2)]);
    assertSchemaRefuses(NormalizedReviewFindingsSchema, [finding(1), finding(1)]);
    assertSchemaRefuses(NormalizedReviewFindingsSchema, [finding(2)]);
    assertSchemaRefuses(NormalizedReviewFindingsSchema, [finding(2), finding(1)]);
  });
});
