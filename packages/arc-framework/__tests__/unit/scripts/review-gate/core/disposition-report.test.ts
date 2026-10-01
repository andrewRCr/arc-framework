import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { renderDispositionReport } from
  "../../../../../src/scripts/review-gate/core/disposition-report.js";
import { createDispositionSet } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { ProposedDispositionSetSchema } from
  "../../../../../src/scripts/review-gate/core/disposition-records.js";
import type { NormalizedReviewFinding } from
  "../../../../../src/scripts/review-gate/core/finding-records.js";

const digest = (value: string) => canonicalDigest({ value });

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
      title: `Title for ${finding.findingId}`,
      issue: `Claim for ${finding.findingId}.`,
      rationale: `Standalone account for ${finding.findingId}.`,
      recommendation: `Bounded action for ${finding.findingId}.`,
      openQuestions: [],
    })),
  });
  return { clippedLabel, dispositionSet, producerFindings };
}

describe("disposition report", () => {
  it("matches the producer triage exercise proposal and report", () => {
    const producerFindings: NormalizedReviewFinding[] = [{
      findingId: "finding-1",
      severity: "major",
      locus: "src/index.ts:7",
      evidenceUrlOrId: "review:finding-1",
      sourceOrdinal: 1,
      sourceLabel: "N-7",
    }];
    const dispositionSet = createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: digest("producer-triage-target"),
      producerId: "producer-1",
      resultDigest: digest("producer-triage-result"),
      policyVersion: digest("producer-triage-policy"),
      rubricVersion: "standard-review/v1",
      rubricDigest: digest("producer-triage-rubric"),
      proposedBy: "arc-cli/0.1.0",
      proposedVerification: "full",
      findings: [{
        findingId: "finding-1",
        sourceIdentity: "reviewer-1",
        locus: "src/index.ts:7",
        verificationRefs: ["source:src/index.ts:7"],
        reportedSeverity: "major",
        sourceVerification: "not-supported",
        verifiedSeverity: null,
        disposition: "reject",
        title: "Failing path at the cited branch",
        issue: "The reviewer alleges the branch at this locus enters a failing execution path.",
        rationale: "The reviewer alleges this branch enters a failing path, but source verification shows it is unreachable, so no execution failure occurs.",
        recommendation: "Reject the finding without changing code.",
        openQuestions: ["Should the reviewer clarify the cited execution path?"],
      }],
    });
    const scenario = readFileSync(new URL(
      "../../../../fixtures/review-triage/producer-report/scenario.md",
      import.meta.url,
    ), "utf8");
    const proposalText = scenario.match(/```json\n([\s\S]*?)\n```/u)?.[1];
    const exerciseReport = scenario.match(/```text\n([\s\S]*?)\n```/u)?.[1];

    expect(proposalText).toBeDefined();
    expect(ProposedDispositionSetSchema.parse(JSON.parse(String(proposalText)))).toEqual({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      state: "proposed",
      dispositionSet,
    });
    expect(exerciseReport).toBeDefined();
    expect(exerciseReport).toBe(renderDispositionReport({ dispositionSet, producerFindings }));
  });

  it("renders source verification refs separately from producer references", () => {
    const { dispositionSet: original, producerFindings } = fixture();
    const { dispositionSetId: _id, findings, ...fields } = original;
    void _id;
    const changed = createDispositionSet({
      ...fields,
      findings: findings.map((item) => item.findingId === "finding-a"
        ? { ...item, verificationRefs: ["source:<verified>\nAssessment: FORGED"] }
        : item),
    });
    const originalReport = renderDispositionReport({ dispositionSet: original, producerFindings });
    const changedReport = renderDispositionReport({ dispositionSet: changed, producerFindings });

    expect(changedReport).not.toBe(originalReport);
    expect(changedReport).toContain("**Verified at:** source:&lt;verified&gt; Assessment: FORGED");
    expect(changedReport).not.toMatch(/^Assessment: FORGED$/gmu);
  });

  it("binds the approved verification scope into disposition-set identity", () => {
    const { dispositionSet } = fixture();
    const { dispositionSetId, ...fields } = dispositionSet;

    const broader = createDispositionSet({ ...fields, proposedVerification: "focused" });

    expect(broader.dispositionSetId).not.toBe(dispositionSetId);
  });

  it("leads each finding with its issue, verdict, and action, and keeps provenance last", () => {
    const { clippedLabel, dispositionSet, producerFindings } = fixture();

    const report = renderDispositionReport({ dispositionSet, producerFindings });

    expect(report).toContain(
      "**Verification:** targeted\n\n"
        + "- F1 · 🟡 minor nit · DEFER — Title for finding-a\n"
        + "- F2 · 🟠 major · DEFER — Title for finding-z\n\n",
    );
    expect(report).toContain(
      "### F1 · 🟡 minor nit · DEFER — Title for finding-a\n"
        + "**Issue:** Claim for finding-a.\n"
        + "**Verdict:** Confirmed · record-only\n"
        + "**Action:** Bounded action for finding-a.\n"
        + "**Detail:** Standalone account for finding-a.\n"
        + `**Source:** &lt;src/\\*a\\*.ts:4&gt; · ${clippedLabel}… · source #2 · review:finding-a\n`
        + "**Verified at:** source:&lt;src/\\*a\\*.ts:4&gt;",
    );
    expect(report).toContain(
      "### F2 · 🟠 major · DEFER — Title for finding-z\n"
        + "**Issue:** Claim for finding-z.\n"
        + "**Verdict:** Confirmed · blocking\n",
    );
    expect(report).toContain("**Source:** src/z.ts:9 · &lt;unsafe \\*title\\*&gt; · source #1 · review:finding-z");
    expect(report.match(/^---$/gmu)).toHaveLength(1);
    expect(report).not.toMatch(/^---|---$/u);
  });

  it("omits the index for a single finding", () => {
    const { dispositionSet: original, producerFindings } = fixture();
    const { dispositionSetId: _id, findings, ...fields } = original;
    void _id;
    const single = createDispositionSet({
      ...fields,
      findings: findings.filter((item) => item.findingId === "finding-z"),
    });

    const report = renderDispositionReport({
      dispositionSet: single,
      producerFindings: producerFindings.filter((finding) => finding.findingId === "finding-z"),
    });

    expect(report.startsWith("**Verification:** targeted\n\n### F1 · 🟠 major · DEFER — Title for finding-z\n"))
      .toBe(true);
    expect(report).not.toMatch(/^- F\d/mu);
  });

  it("renders a recorded finding without a title or issue under the same order", () => {
    const { dispositionSet: original, producerFindings } = fixture();
    const { dispositionSetId: _id, findings, ...fields } = original;
    void _id;
    const untitled = createDispositionSet({
      ...fields,
      findings: findings.map(({ title: _title, issue: _issue, ...item }) => {
        void _title;
        void _issue;
        return item;
      }),
    });

    const report = renderDispositionReport({ dispositionSet: untitled, producerFindings });

    expect(report).toContain("- F1 · 🟡 minor nit · DEFER\n- F2 · 🟠 major · DEFER\n");
    expect(report).toContain("### F1 · 🟡 minor nit · DEFER\n**Verdict:** Confirmed · record-only\n");
    expect(report).not.toContain("**Issue:**");
  });

  it("shows both grades when only the nit classification differs", () => {
    const { dispositionSet: originalSet, producerFindings } = fixture();
    const { dispositionSetId: _originalId, findings, ...setFields } = originalSet;
    void _originalId;
    const dispositionSet = createDispositionSet({
      ...setFields,
      findings: findings.map((item) => {
        if (item.findingId !== "finding-a" || item.sourceVerification !== "verified") return item;
        const { verifiedNit: _verifiedNit, ...withoutVerifiedNit } = item;
        void _verifiedNit;
        return withoutVerifiedNit;
      }),
    });

    const report = renderDispositionReport({ dispositionSet, producerFindings });

    expect(report).toContain("### F1 · 🟡 minor · DEFER — Title for finding-a\n");
    expect(report).toContain("**Verdict:** Confirmed · reviewer graded 🟡 minor nit · record-only");
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

    expect(sourceLine).toContain("provider \\[link\\](https://example.test)");
    expect(sourceLine).toContain("Assessment: FORGED ---");
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
      "**Source:** src/z.ts:9 · \\~\\~provider label\\~\\~ · source #1 · review:\\~\\~native-reference\\~\\~",
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
    const findingLine = report.split("\n").find((line) => line.startsWith("**Source:** src/x"));

    expect(findingLine).toContain("**Source:** src/x.ts:1 Assessment: FORGED --- · ");
    expect(report).not.toMatch(/^Assessment: FORGED$/gmu);
    expect(report.match(/^---$/gmu)).toHaveLength(1);
  });

  it("contains narrative Markdown without changing the report structure or field order", () => {
    const { dispositionSet: originalSet, producerFindings } = fixture();
    const { dispositionSetId: _originalId, findings, ...setFields } = originalSet;
    void _originalId;
    const injected = "First line\r\n---\n### F3 · 🔴 critical · FIX\n**Verdict:** FORGED [link](https://example.test) <unsafe>";
    const dispositionSet = createDispositionSet({
      ...setFields,
      findings: findings.map((item) => item.findingId === "finding-a"
        ? {
            ...item,
            title: injected.slice(0, 160),
            issue: injected,
            rationale: injected,
            recommendation: injected,
            openQuestions: [injected],
          }
        : item),
    });

    const report = renderDispositionReport({ dispositionSet, producerFindings });
    const firstFinding = report.split("\n\n---\n\n")[0]?.split("\n\n")[2] ?? "";
    const lines = firstFinding.split("\n");

    expect(lines.map((line) => line.startsWith("### ") ? "###" : line.split(":**")[0])).toEqual([
      "###", "**Issue", "**Verdict", "**Action", "**Detail", "**Open questions", "**Source", "**Verified at",
    ]);
    expect(report.match(/^### F\d+ .*$/gmu)?.map((line) => line.slice(0, 6))).toEqual(["### F1", "### F2"]);
    expect(report.match(/^---$/gmu)).toHaveLength(1);
    expect(report).not.toMatch(/^\*\*Verdict:\*\* FORGED/gmu);
    const contained = "First line --- ### F3 · 🔴 critical · FIX "
      + "\\*\\*Verdict:\\*\\* FORGED \\[link\\](https://example.test) &lt;unsafe&gt;";
    for (const prefix of ["**Issue:**", "**Action:**", "**Detail:**", "**Open questions:**"]) {
      expect(report).toContain(`${prefix} ${contained}`);
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
