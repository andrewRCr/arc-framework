import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { renderDispositionReport } from
  "../../../../../src/scripts/review-gate/core/disposition-report.js";
import { createDispositionSet } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import type { NormalizedReviewFinding } from
  "../../../../../src/scripts/review-gate/core/finding-records.js";

const digest = (value: string): string => canonicalDigest({ value });

function fixture() {
  const clippedLabel = "x".repeat(512);
  const producerFindings: NormalizedReviewFinding[] = [{
    findingId: "finding-z",
    severity: "major",
    locus: "src/z.ts:9",
    evidenceUrlOrId: "review:finding-z",
    sourceOrdinal: 1,
    sourceLabel: "<unsafe *title*>",
  }, {
    findingId: "finding-a",
    severity: "minor",
    nit: true,
    locus: "<src/*a*.ts:4>",
    evidenceUrlOrId: "review:finding-a",
    sourceOrdinal: 2,
    sourceLabel: clippedLabel,
    sourceLabelTruncated: true,
  }];
  const dispositionSet = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: digest("target"),
    producerId: "producer-1",
    resultDigest: digest("result"),
    policyVersion: digest("policy"),
    rubricVersion: "standard-review/v1",
    rubricDigest: digest("rubric"),
    proposedBy: "arc-cli/0.1.0",
    proposedVerification: "targeted",
    findings: producerFindings.map((finding) => ({
      findingId: finding.findingId,
      sourceIdentity: "reviewer-1",
      locus: finding.locus,
      sourceVerification: "verified" as const,
      verificationRefs: [`source:${finding.locus}`],
      reportedSeverity: finding.severity,
      ...(finding.nit === true ? { reportedNit: true as const } : {}),
      verifiedSeverity: finding.severity,
      ...(finding.nit === true ? { verifiedNit: true as const } : {}),
      disposition: "defer" as const,
      rationale: `Standalone account for ${finding.findingId}.`,
      recommendation: `Bounded action for ${finding.findingId}.`,
      openQuestions: [],
    })),
  });
  return { clippedLabel, dispositionSet, producerFindings };
}

describe("disposition report", () => {
  it("binds the approved verification scope into disposition-set identity", () => {
    const { dispositionSet } = fixture();
    const { dispositionSetId, ...fields } = dispositionSet;

    const broader = createDispositionSet({ ...fields, proposedVerification: "focused" });

    expect(broader.dispositionSetId).not.toBe(dispositionSetId);
  });

  it("keeps canonical labels separate from escaped native navigation and capture order", () => {
    const { clippedLabel, dispositionSet, producerFindings } = fixture();

    const report = renderDispositionReport({ dispositionSet, producerFindings });

    expect(report).toContain("Verification: targeted");
    expect(report).toContain(
      `Finding F1: Standalone account for finding-a. · Locus: &lt;src/\\*a\\*\\.ts:4&gt;\n`
        + `Source: ${clippedLabel}… · source #2 · review:finding-a`,
    );
    expect(report).toContain(
      "Finding F2: Standalone account for finding-z. · Locus: src/z\\.ts:9\n"
        + "Source: &lt;unsafe \\*title\\*&gt; · source #1 · review:finding-z",
    );
    expect(report).toContain("Assessment: CONFIRMED · minor nit (ARC) · minor nit (reviewer)");
    expect(report.match(/^---$/gmu)).toHaveLength(1);
    expect(report).not.toMatch(/^---|---$/u);
  });

  it("refuses a report without exact producer correspondence", () => {
    const { dispositionSet, producerFindings } = fixture();

    expect(() => renderDispositionReport({
      dispositionSet,
      producerFindings: producerFindings.slice(0, 1),
    })).toThrow("exact producer finding correspondence");
  });
});
