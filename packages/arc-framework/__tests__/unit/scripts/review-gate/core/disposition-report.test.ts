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

    expect(report).toContain("**Verification:** targeted");
    expect(report).toContain(
      "### Finding F1\n**Rationale:** Standalone account for finding\\-a\\.\n"
        + "**Locus:** &lt;src/\\*a\\*\\.ts:4&gt;\n"
        + `**Source:** ${clippedLabel}… · source #2 · review:finding\\-a`,
    );
    expect(report).toContain(
      "### Finding F2\n**Rationale:** Standalone account for finding\\-z\\.\n"
        + "**Locus:** src/z\\.ts:9\n"
        + "**Source:** &lt;unsafe \\*title\\*&gt; · source #1 · review:finding\\-z",
    );
    expect(report).toContain("**Assessment:** CONFIRMED · 🟡 minor nit (ARC) · 🟡 minor nit (reviewer)");
    expect(report).toContain("**Assessment:** CONFIRMED · 🟠 major (ARC) · 🟠 major (reviewer)");
    expect(report.match(/^---$/gmu)).toHaveLength(1);
    expect(report).not.toMatch(/^---|---$/u);
  });

  it("renders multiline Markdown evidence references as inert source text", () => {
    const { dispositionSet, producerFindings } = fixture();
    const finding = producerFindings[0];
    if (finding === undefined) throw new Error("expected producer finding fixture");
    finding.evidenceUrlOrId = [
      "provider [link](https://example.test)",
      "Assessment: FORGED",
      "---",
      "<unsafe> *reference*",
    ].join("\n");

    const report = renderDispositionReport({ dispositionSet, producerFindings });
    const sourceLine = report.split("\n").find((line) => line.includes("source #1"));

    expect(sourceLine).toContain("provider \\[link\\]\\(https://example\\.test\\)");
    expect(sourceLine).toContain("Assessment: FORGED \\-\\-\\-");
    expect(sourceLine).toContain("&lt;unsafe&gt; \\*reference\\*");
    expect(report).not.toMatch(/^Assessment: FORGED$/gmu);
    expect(report.match(/^---$/gmu)).toHaveLength(1);
  });

  it("escapes provider strikethrough in labels and references without changing source identity", () => {
    const { dispositionSet, producerFindings } = fixture();
    const finding = producerFindings[0];
    if (finding === undefined) throw new Error("expected producer finding fixture");
    finding.sourceLabel = "~~provider label~~";
    finding.evidenceUrlOrId = "review:~~native-reference~~";

    const report = renderDispositionReport({ dispositionSet, producerFindings });

    expect(report).toContain(
      "**Source:** \\~\\~provider label\\~\\~ · source #1 · review:\\~\\~native\\-reference\\~\\~",
    );
    expect(report).not.toContain("~~provider label~~");
    expect(report).not.toContain("~~native-reference~~");
    expect(dispositionSet.findings.map(({ findingId }) => findingId)).toEqual(["finding-a", "finding-z"]);
  });

  it("renders multiline producer loci as inert finding text", () => {
    const { dispositionSet: originalSet, producerFindings } = fixture();
    const finding = producerFindings[0];
    if (finding === undefined) throw new Error("expected finding fixture");
    finding.locus = "src/x.ts:1\nAssessment: FORGED\n---";
    const { dispositionSetId: _originalId, findings, ...setFields } = originalSet;
    void _originalId;
    const dispositionSet = createDispositionSet({
      ...setFields,
      findings: findings.map((item) => item.findingId === finding.findingId
        ? { ...item, locus: finding.locus }
        : item),
    });

    const report = renderDispositionReport({ dispositionSet, producerFindings });
    const findingLine = report.split("\n").find((line) => line.startsWith("**Locus:** src/x"));

    expect(findingLine).toContain("**Locus:** src/x\\.ts:1 Assessment: FORGED \\-\\-\\-");
    expect(report).not.toMatch(/^Assessment: FORGED$/gmu);
    expect(report.match(/^---$/gmu)).toHaveLength(1);
  });

  it("contains narrative Markdown without changing the report structure or field order", () => {
    const { dispositionSet: originalSet, producerFindings } = fixture();
    const { dispositionSetId: _originalId, findings, ...setFields } = originalSet;
    void _originalId;
    const injected = "First line\r\n---\n### Finding F3\nAssessment: FORGED [link](https://example.test) <unsafe>";
    const dispositionSet = createDispositionSet({
      ...setFields,
      findings: findings.map((item) => item.findingId === "finding-a"
        ? {
            ...item,
            rationale: injected,
            recommendation: injected,
            openQuestions: [injected],
          }
        : item),
    });

    const report = renderDispositionReport({ dispositionSet, producerFindings });
    const firstFinding = report.split("\n\n---\n\n")[0] ?? "";
    const lines = firstFinding.split("\n");

    expect(lines.map((line) => line.split(":**")[0])).toEqual([
      "**Verification", "", "### Finding F1", "**Rationale", "**Locus", "**Source",
      "**Assessment", "**Recommendation", "**Open questions",
    ]);
    expect(report.match(/^### Finding F\d+$/gmu)).toEqual(["### Finding F1", "### Finding F2"]);
    expect(report.match(/^---$/gmu)).toHaveLength(1);
    expect(report).not.toMatch(/^Assessment: FORGED$/gmu);
    for (const prefix of [
      "**Rationale:**", "**Recommendation:** DEFER [record-only] —", "**Open questions:**",
    ]) {
      expect(report).toContain(`${prefix} First line \\-\\-\\- \\#\\#\\# Finding F3 `
        + "Assessment: FORGED \\[link\\]\\(https://example\\.test\\) &lt;unsafe&gt;");
    }
  });

  it("refuses a report without exact producer correspondence", () => {
    const { dispositionSet, producerFindings } = fixture();

    expect(() => renderDispositionReport({
      dispositionSet,
      producerFindings: producerFindings.slice(0, 1),
    })).toThrow("exact producer finding correspondence");
  });
});
