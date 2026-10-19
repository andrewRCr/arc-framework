import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { renderDispositionEvidence, renderDispositionReport } from
  "../../../../../src/scripts/review-gate/core/disposition-report.js";
import { createDispositionSet } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { ProposedDispositionSetSchema } from
  "../../../../../src/scripts/review-gate/core/disposition-records.js";
import type { NormalizedReviewFinding } from
  "../../../../../src/scripts/review-gate/core/finding-records.js";

const digest = (value: string) => canonicalDigest({ value });
const PLACEHOLDER = /\{[^}]+\}|<[^>]+>/u;

function shippedMethod(name: string): string {
  return readFileSync(new URL(`../../../../../arc/system/methods/${name}.md`, import.meta.url), "utf8");
}

/** Splits each documented line shape into the literal fragments around its placeholders. */
function lineShapes(lines: string[]): string[][] {
  return lines
    .map((line) => line.replace(/\s+\[[^\]]*\]$/u, ""))
    .filter((line) => line.trim() !== "")
    .map((line) => line.split(PLACEHOLDER));
}

function markdownBlockLines(method: string): string[] {
  return [...method.matchAll(/```markdown\n([\s\S]*?)\n```/gu)].flatMap((match) => String(match[1]).split("\n"));
}

function matchesShape(line: string, [first = "", ...rest]: string[]): boolean {
  if (!line.startsWith(first)) return false;
  let at = first.length;
  for (const fragment of rest) {
    const found = line.indexOf(fragment, at);
    if (found < 0) return false;
    at = found + fragment.length;
  }
  return true;
}

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
  it("renders the four-column decision with a header and per-finding status lines", () => {
    const input = { ...fixture(), headerLine: "Complete pass 1 of 2 · provisional",
      decisions: ["Approve the complete disposition set?"],
      fails: [{ findingId: "finding-z", fails: "Correctness and failure behavior" },
        { findingId: "finding-a", fails: "none — advisory polish" }] };
    const report = renderDispositionReport(input);
    expect(report).toContain("Complete pass 1 of 2 · provisional\n\n**Verification:** targeted");
    expect(report).toContain("| # | Grade | Finding | Action |\n|---|---|---|---|");
    expect(report).toContain("| F1 | 🟠 major | Title for finding-z | DEFER |");
    expect(report).toContain("| F2 | 🟡 minor nit · record-only | Title for finding-a | DEFER |");
    expect(report).toContain("**Decisions**\n- Approve the complete disposition set?");
    expect(report).toContain("### F1 — Title for finding-z\n\n🟠 major · Confirmed · blocking · DEFER");
    expect(report).toContain("**Finding:** Claim for finding-z.\n\n**Fails:** Correctness and failure behavior");
  });

  it("marks record-only in the grade cell and leaves an unsupported grade absent", () => {
    const { dispositionSet: original, producerFindings } = fixture();
    const { dispositionSetId: _id, ...fields } = original;
    void _id;
    const dispositionSet = createDispositionSet({ ...fields, findings: fields.findings.map(item =>
      item.findingId === "finding-z" ? { ...item, sourceVerification: "not-supported", verifiedSeverity: null,
        disposition: "reject" } : item) });
    const report = renderDispositionReport({ dispositionSet, producerFindings });
    expect(report).toContain("| F1 | 🟡 minor nit · record-only | Title for finding-a | DEFER |");
    expect(report).toContain("| F2 | — | Title for finding-z | REJECT |");
    expect(report).toContain("— · Not supported · reviewer graded 🟠 major · record-only · REJECT");
  });

  it("sorts tagged fixes for display while keeping canonical labels in every view", () => {
    const { dispositionSet: original, producerFindings: producers } = fixture();
    const { dispositionSetId: _id, ...fields } = original;
    void _id;
    const producerFindings = producers.map(({ nit: _nit, ...finding }) => {
      void _nit;
      return { ...finding, severity: "major" as const };
    });
    const dispositionSet = createDispositionSet({ ...fields, findings: fields.findings.map(item => {
      if (item.sourceVerification !== "verified") throw new Error("expected verified fixture findings");
      const { reportedNit: _reportedNit, verifiedNit: _verifiedNit, ...finding } = item;
      void _reportedNit; void _verifiedNit;
      return { ...finding, sourceVerification: "verified" as const, reportedSeverity: "major" as const,
        verifiedSeverity: "major" as const, disposition: "fix" as const,
        openQuestions: [`Question for ${item.findingId}?`] };
    }) });
    const input = { dispositionSet, producerFindings };
    const canonical = renderDispositionReport(input);
    const tags = [{ findingId: "finding-z", tag: "new-design" as const },
      { findingId: "finding-a", tag: "local-correction" as const }];
    const tagged = renderDispositionReport({ ...input, tags });
    expect(canonical.match(/^\| F\d+ .*$/gmu)).toEqual([
      "| F1 | 🟠 major | Title for finding-a | FIX |",
      "| F2 | 🟠 major | Title for finding-z | FIX |",
    ]);
    expect(tagged.match(/^\| F\d+ .*$/gmu)).toEqual([
      "| F2 | 🟠 major | Title for finding-z | FIX (new design) |",
      "| F1 | 🟠 major | Title for finding-a | FIX (local correction) |",
    ]);
    expect(tagged).toContain("**Fix tags:** agent's advisory reading.");
    expect(tagged).toContain("- F2: Question for finding-z?\n- F1: Question for finding-a?");
    expect(tagged.match(/^### F\d+ .*$/gmu)).toEqual([
      "### F2 — Title for finding-z", "### F1 — Title for finding-a",
    ]);
    expect(renderDispositionEvidence({ ...input, tags }).match(/^- F\d+ · \S+/gmu)).toEqual([
      "- F2 · src/z.ts:9", "- F1 · &lt;src/\\*a\\*.ts:4&gt;",
    ]);
    expect(renderDispositionReport(input)).toBe(canonical);
  });

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
    const [exerciseReport, exerciseEvidence] = [...scenario.matchAll(/```text\n([\s\S]*?)\n```/gu)]
      .map((match) => match[1]);

    expect(proposalText).toBeDefined();
    expect(ProposedDispositionSetSchema.parse(JSON.parse(String(proposalText)))).toEqual({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      state: "proposed",
      dispositionSet,
    });
    expect(exerciseReport).toBeDefined();
    expect(exerciseReport).toBe(renderDispositionReport({ dispositionSet, producerFindings }));
    expect(exerciseEvidence).toBe(renderDispositionEvidence({ dispositionSet, producerFindings }));
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
    const originalEvidence = renderDispositionEvidence({ dispositionSet: original, producerFindings });
    const changedEvidence = renderDispositionEvidence({ dispositionSet: changed, producerFindings });

    expect(changedEvidence).not.toBe(originalEvidence);
    expect(changedEvidence).toContain(" · source #2 · review:finding-a · verified at source:&lt;verified&gt; Assessment: FORGED");
    expect(changedEvidence).not.toMatch(/^Assessment: FORGED$/gmu);
  });

  it("binds the approved verification scope into disposition-set identity", () => {
    const { dispositionSet } = fixture();
    const { dispositionSetId, ...fields } = dispositionSet;

    const broader = createDispositionSet({ ...fields, proposedVerification: "focused" });

    expect(broader.dispositionSetId).not.toBe(dispositionSetId);
  });

  it("leads with a decision table and follows with one section per finding, a paragraph per field", () => {
    const { dispositionSet, producerFindings } = fixture();

    const report = renderDispositionReport({ dispositionSet, producerFindings });

    expect(dispositionSet.findings.map(({ findingId }) => findingId)).toEqual(["finding-a", "finding-z"]);
    expect(report).toBe([
      "**Verification:** targeted",
      "",
      "| # | Grade | Finding | Action |",
      "|---|---|---|---|",
      "| F1 | 🟠 major | Title for finding-z | DEFER |",
      "| F2 | 🟡 minor nit · record-only | Title for finding-a | DEFER |",
      "",
      "### F1 — Title for finding-z",
      "",
      "🟠 major · Confirmed · blocking · DEFER",
      "",
      "**Finding:** Claim for finding-z.",
      "",
      "**Action:** Bounded action for finding-z.",
      "",
      "**Detail:** Standalone account for finding-z.",
      "",
      "---",
      "",
      "### F2 — Title for finding-a",
      "",
      "🟡 minor nit · Confirmed · record-only · DEFER",
      "",
      "**Finding:** Claim for finding-a.",
      "",
      "**Action:** Bounded action for finding-a.",
      "",
      "**Detail:** Standalone account for finding-a.",
    ].join("\n"));
    expect(report).not.toContain("**Evidence**");
  });

  it("renders the evidence separately, one line per finding under its report label", () => {
    const { clippedLabel, dispositionSet, producerFindings } = fixture();

    const evidence = renderDispositionEvidence({ dispositionSet, producerFindings });

    expect(evidence).toBe([
      "**Evidence**",
      "- F1 · src/z.ts:9 · &lt;unsafe \\*title\\*&gt; · source #1 · review:finding-z · verified at source:src/z.ts:9",
      `- F2 · &lt;src/\\*a\\*.ts:4&gt; · ${clippedLabel}… · source #2 · review:finding-a`
        + " · verified at source:&lt;src/\\*a\\*.ts:4&gt;",
    ].join("\n"));
  });

  it("orders findings by gating and ARC grade, keeping canonical order among equals", () => {
    const { dispositionSet: original, producerFindings } = fixture();
    const { dispositionSetId: _id, findings, ...fields } = original;
    void _id;
    const extraFindings: NormalizedReviewFinding[] = [{
      findingId: "finding-c",
      severity: "critical",
      locus: "src/c.ts:1",
      evidenceUrlOrId: "review:finding-c",
      sourceOrdinal: 3,
    }, {
      findingId: "finding-r",
      severity: "critical",
      locus: "src/r.ts:1",
      evidenceUrlOrId: "review:finding-r",
      sourceOrdinal: 4,
    }, {
      findingId: "finding-y",
      severity: "major",
      locus: "src/y.ts:1",
      evidenceUrlOrId: "review:finding-y",
      sourceOrdinal: 5,
    }];
    const narrative = (findingId: string) => ({
      title: `Title for ${findingId}`,
      rationale: `Standalone account for ${findingId}.`,
      recommendation: `Bounded action for ${findingId}.`,
      openQuestions: [],
    });
    const ordered = createDispositionSet({
      ...fields,
      findings: [...findings, {
        findingId: "finding-c",
        sourceIdentity: "reviewer-1",
        locus: "src/c.ts:1",
        sourceVerification: "verified" as const,
        verificationRefs: ["source:src/c.ts:1"],
        reportedSeverity: "critical" as const,
        verifiedSeverity: "critical" as const,
        disposition: "fix" as const,
        ...narrative("finding-c"),
      }, {
        findingId: "finding-r",
        sourceIdentity: "reviewer-1",
        locus: "src/r.ts:1",
        sourceVerification: "not-supported" as const,
        verificationRefs: ["source:src/r.ts:1"],
        reportedSeverity: "critical" as const,
        verifiedSeverity: null,
        disposition: "reject" as const,
        ...narrative("finding-r"),
      }, {
        findingId: "finding-y",
        sourceIdentity: "reviewer-1",
        locus: "src/y.ts:1",
        sourceVerification: "verified" as const,
        verificationRefs: ["source:src/y.ts:1"],
        reportedSeverity: "major" as const,
        verifiedSeverity: "major" as const,
        disposition: "defer" as const,
        ...narrative("finding-y"),
      }],
    });

    const input = { dispositionSet: ordered, producerFindings: [...producerFindings, ...extraFindings] };
    const report = renderDispositionReport(input);

    expect(ordered.findings.map(({ findingId }) => findingId))
      .toEqual(["finding-a", "finding-y", "finding-z", "finding-c", "finding-r"]);
    expect(report.match(/^\| F\d+ .*$/gmu)).toEqual([
      "| F1 | 🔴 critical | Title for finding-c | FIX |",
      "| F2 | 🟠 major | Title for finding-y | DEFER |",
      "| F3 | 🟠 major | Title for finding-z | DEFER |",
      "| F4 | 🟡 minor nit · record-only | Title for finding-a | DEFER |",
      "| F5 | — | Title for finding-r | REJECT |",
    ]);
    expect(report.match(/^### F\d+ .*$/gmu)).toEqual([
      "### F1 — Title for finding-c",
      "### F2 — Title for finding-y",
      "### F3 — Title for finding-z",
      "### F4 — Title for finding-a",
      "### F5 — Title for finding-r",
    ]);
    expect(renderDispositionEvidence(input).match(/^- F\d+ · \S+/gmu)).toEqual([
      "- F1 · src/c.ts:1",
      "- F2 · src/y.ts:1",
      "- F3 · src/z.ts:9",
      "- F4 · &lt;src/\\*a\\*.ts:4&gt;",
      "- F5 · src/r.ts:1",
    ]);
  });

  it("places a nit after other minor findings even when it sorts first canonically", () => {
    const { dispositionSet: original, producerFindings } = fixture();
    const { dispositionSetId: _id, findings, ...fields } = original;
    void _id;
    const minorFinding: NormalizedReviewFinding = {
      findingId: "finding-m",
      severity: "minor",
      locus: "src/m.ts:1",
      evidenceUrlOrId: "review:finding-m",
      sourceOrdinal: 3,
    };
    const ordered = createDispositionSet({
      ...fields,
      findings: [...findings, {
        findingId: "finding-m",
        sourceIdentity: "reviewer-1",
        locus: "src/m.ts:1",
        sourceVerification: "verified" as const,
        verificationRefs: ["source:src/m.ts:1"],
        reportedSeverity: "minor" as const,
        verifiedSeverity: "minor" as const,
        disposition: "defer" as const,
        title: "Title for finding-m",
        rationale: "Standalone account for finding-m.",
        recommendation: "Bounded action for finding-m.",
        openQuestions: [],
      }],
    });

    const report = renderDispositionReport({
      dispositionSet: ordered,
      producerFindings: [...producerFindings, minorFinding],
    });

    expect(ordered.findings.map(({ findingId }) => findingId)).toEqual(["finding-a", "finding-m", "finding-z"]);
    expect(report.match(/^\| F\d+ .*$/gmu)).toEqual([
      "| F1 | 🟠 major | Title for finding-z | DEFER |",
      "| F2 | 🟡 minor · record-only | Title for finding-m | DEFER |",
      "| F3 | 🟡 minor nit · record-only | Title for finding-a | DEFER |",
    ]);
  });

  it("renders exactly the line shapes the shipped report and evidence shapes describe", () => {
    const { dispositionSet: original, producerFindings } = fixture();
    const { dispositionSetId: _id, findings, ...fields } = original;
    void _id;
    const dispositionSet = createDispositionSet({
      ...fields,
      findings: findings.map((item) => ({ ...item, openQuestions: [`Question for ${item.findingId}?`] })),
    });
    const input = { dispositionSet, producerFindings, headerLine: "Complete pass 1 of 2 · provisional",
      decisions: ["Approve the complete disposition set?"],
      fails: dispositionSet.findings.map(item => ({ findingId: item.findingId, fails: "Correctness" })) };
    const report = renderDispositionReport(input);
    const rendered = [...report.split("\n"), ...renderDispositionEvidence(input).split("\n")]
      .filter((line) => line !== "");
    const shared = shippedMethod("disposition-report");
    const codeReview = shippedMethod("review-triage");
    const verificationLine = codeReview.match(/`(\*\*Verification:\*\* [^`]+)`/u)?.[1];
    const documented = lineShapes([
      ...markdownBlockLines(shared),
      ...markdownBlockLines(codeReview),
      String(verificationLine),
    ]);

    expect(verificationLine).toBeDefined();
    expect(shared.replace(/\s+/gu, " ")).toContain("adjacent sections with a blank line, `---`, and another blank line");
    expect(report).toContain("\n\n---\n\n");
    for (const shape of documented) {
      expect(rendered.some((line) => matchesShape(line, shape)), `renders ${shape.join("…")}`).toBe(true);
    }
    for (const line of rendered.filter((item) => item !== "---")) {
      expect(documented.some((shape) => matchesShape(line, shape)), `documents ${line}`).toBe(true);
    }
  });

  it("lists every open question under the table by finding, and keeps them out of the sections", () => {
    const { dispositionSet: original, producerFindings } = fixture();
    const { dispositionSetId: _id, findings, ...fields } = original;
    void _id;
    const questioned = createDispositionSet({
      ...fields,
      findings: findings.map((item) => ({
        ...item,
        openQuestions: item.findingId === "finding-a"
          ? ["First question for finding-a?", "Second question for finding-a?"]
          : ["Question for finding-z?"],
      })),
    });

    const report = renderDispositionReport({ dispositionSet: questioned, producerFindings });

    expect(report).toContain(
      "| F2 | 🟡 minor nit · record-only | Title for finding-a | DEFER |\n\n"
        + "**Decisions**\n"
        + "- F1: Question for finding-z?\n"
        + "- F2: First question for finding-a?\n"
        + "- F2: Second question for finding-a?\n\n"
        + "### F1 — Title for finding-z\n",
    );
    expect(report.endsWith("**Detail:** Standalone account for finding-a.")).toBe(true);
    expect(report).not.toContain("**Open questions:**");
  });

  it("escapes a table delimiter in a title so it cannot add cells to its row", () => {
    const { dispositionSet: original, producerFindings } = fixture();
    const { dispositionSetId: _id, findings, ...fields } = original;
    void _id;
    const forged = "Forged | 🔴 critical | Confirmed · blocking | FIX | cell";
    const dispositionSet = createDispositionSet({
      ...fields,
      findings: findings.map((item) => item.findingId === "finding-a" ? { ...item, title: forged } : item),
    });

    const report = renderDispositionReport({ dispositionSet, producerFindings });

    expect(report).toContain(
      "| F2 | 🟡 minor nit · record-only | "
        + "Forged \\| 🔴 critical \\| Confirmed · blocking \\| FIX \\| cell | DEFER |\n",
    );
    expect(report).toContain(`### F2 — ${forged}\n`);
    expect(report.match(/^\| F\d+ /gmu)).toHaveLength(2);
  });

  it("renders the decision table for a single finding", () => {
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

    expect(report.startsWith(
      "**Verification:** targeted\n\n"
        + "| # | Grade | Finding | Action |\n"
        + "|---|---|---|---|\n"
        + "| F1 | 🟠 major | Title for finding-z | DEFER |\n\n"
        + "### F1 — Title for finding-z\n\n",
    )).toBe(true);
    expect(report.endsWith("**Detail:** Standalone account for finding-z.")).toBe(true);
  });

  it("renders a recorded finding without a title or issue under the same shape", () => {
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

    expect(report).toContain(
      "| F1 | 🟠 major | — | DEFER |\n"
        + "| F2 | 🟡 minor nit · record-only | — | DEFER |\n",
    );
    expect(report).toContain("### F1\n\n🟠 major · Confirmed · blocking · DEFER\n\n**Action:** Bounded action for finding-z.\n");
    expect(report).not.toContain("**Finding:**");
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

    expect(report).toContain(
      "| F2 | 🟡 minor · record-only | Title for finding-a | DEFER |\n",
    );
    expect(report).toContain("🟡 minor · Confirmed · reviewer graded 🟡 minor nit · record-only · DEFER");
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

    const evidence = renderDispositionEvidence({ dispositionSet, producerFindings });
    const sourceLine = evidence.split("\n").find((line) => line.includes("source #1"));

    expect(sourceLine).toContain("provider \\[link\\](https://example.test)");
    expect(sourceLine).toContain("Assessment: FORGED ---");
    expect(sourceLine).toContain("&lt;unsafe&gt; \\*reference\\*");
    expect(evidence).not.toMatch(/^Assessment: FORGED$/gmu);
    expect(evidence).not.toMatch(/^---$/gmu);
  });

  it("escapes provider strikethrough in labels and references without changing source identity", () => {
    const { dispositionSet, producerFindings } = fixture();
    const finding = producerFindings[0];
    if (finding === undefined) throw new Error("expected producer finding fixture");
    finding.sourceLabel = "~~provider label~~";
    finding.evidenceUrlOrId = "review:~~native-reference~~";

    const evidence = renderDispositionEvidence({ dispositionSet, producerFindings });

    expect(evidence).toContain(
      "- F1 · src/z.ts:9 · \\~\\~provider label\\~\\~ · source #1 · review:\\~\\~native-reference\\~\\~"
        + " · verified at source:src/z.ts:9",
    );
    expect(evidence).not.toContain("~~provider label~~");
    expect(evidence).not.toContain("~~native-reference~~");
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
    const evidence = renderDispositionEvidence({ dispositionSet, producerFindings });
    const findingLine = evidence.split("\n").find((line) => line.startsWith("- F1 · src/x"));

    expect(findingLine).toContain("- F1 · src/x.ts:1 Assessment: FORGED --- · ");
    expect(evidence).not.toMatch(/^Assessment: FORGED$/gmu);
    expect(evidence).not.toMatch(/^---$/gmu);
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
    const injectedSection = report.split("\n\n---\n\n")[1] ?? "";
    const paragraphs = injectedSection.split("\n\n");

    expect(paragraphs.map((line) => line.startsWith("### ") ? "###" : line.split(":**")[0])).toEqual([
      "###", "🟡 minor nit · Confirmed · record-only · DEFER", "**Finding", "**Action", "**Detail",
    ]);
    expect(report.match(/^\| F\d+ /gmu)).toHaveLength(2);
    expect(report.match(/^### F\d+ .*$/gmu)?.map((line) => line.slice(0, 6))).toEqual(["### F1", "### F2"]);
    expect(report.match(/^---$/gmu)).toHaveLength(1);
    expect(report).not.toMatch(/^\*\*Verdict:\*\* FORGED/gmu);
    const contained = "First line --- ### F3 · 🔴 critical · FIX "
      + "\\*\\*Verdict:\\*\\* FORGED \\[link\\](https://example.test) &lt;unsafe&gt;";
    for (const prefix of ["**Finding:**", "**Action:**", "**Detail:**", "- F2:"]) {
      expect(report).toContain(`${prefix} ${contained}`);
    }
  });

  it("refuses a report without exact producer correspondence", () => {
    const { dispositionSet, producerFindings } = fixture();

    expect(() => renderDispositionReport({
      dispositionSet,
      producerFindings: producerFindings.slice(0, 1),
    })).toThrow("exact producer finding correspondence");
    expect(() => renderDispositionEvidence({
      dispositionSet,
      producerFindings: producerFindings.slice(0, 1),
    })).toThrow("exact producer finding correspondence");
  });
});
