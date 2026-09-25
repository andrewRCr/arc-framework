/** Deterministic human-facing reports over canonical dispositions and their exact producer findings. */

import type { DispositionReportItem, DispositionSet } from "./disposition-records.js";
import { validateDispositionSet } from "./dispositions.js";
import {
  escapeReviewFindingDisplayText,
  NormalizedReviewFindingsSchema,
  type NormalizedReviewFinding,
} from "./finding-records.js";

function displaySeverity(severity: "critical" | "major" | "minor", nit: true | undefined): string {
  const symbol = { critical: "🔴", major: "🟠", minor: "🟡" }[severity];
  return `${symbol} ${severity}${nit === true ? " nit" : ""}`;
}

function renderSource(finding: NormalizedReviewFinding): string {
  const escapedLabel = finding.sourceLabel === undefined
    ? undefined
    : escapeReviewFindingDisplayText(finding.sourceLabel);
  const escapedReference = escapeReviewFindingDisplayText(finding.evidenceUrlOrId);
  const label = escapedLabel === undefined
    ? ""
    : `${escapedLabel}${finding.sourceLabelTruncated === true ? "…" : ""} · `;
  return `**Source:** ${label}source #${finding.sourceOrdinal} · ${escapedReference}`;
}

function renderAssessment(item: DispositionReportItem): string {
  const reviewer = displaySeverity(item.reportedSeverity, item.reportedNit);
  if (item.sourceVerification === "not-supported") {
    return `**Assessment:** NOT SUPPORTED · no ARC severity (ARC) · ${reviewer} (reviewer)`;
  }
  const verified = displaySeverity(item.verifiedSeverity, item.verifiedNit);
  return `**Assessment:** CONFIRMED · ${verified} (ARC) · ${reviewer} (reviewer)`;
}

function validateCorrespondence(item: DispositionReportItem, finding: NormalizedReviewFinding): void {
  if (item.locus !== finding.locus
    || item.reportedSeverity !== finding.severity
    || item.reportedNit !== finding.nit) {
    throw new Error(`disposition finding '${item.findingId}' does not match its producer finding`);
  }
}

function renderFinding(
  item: DispositionReportItem,
  finding: NormalizedReviewFinding,
  reportOrdinal: number,
): string {
  const lines = [
    `### Finding F${reportOrdinal}`,
    `**Rationale:** ${escapeReviewFindingDisplayText(item.rationale)}`,
    `**Locus:** ${escapeReviewFindingDisplayText(finding.locus)}`,
    renderSource(finding),
    renderAssessment(item),
    `**Recommendation:** ${item.disposition.toUpperCase()} [${item.gating}] — `
      + escapeReviewFindingDisplayText(item.recommendation),
  ];
  if (item.openQuestions.length > 0) {
    lines.push(`**Open questions:** ${item.openQuestions
      .map(escapeReviewFindingDisplayText).join(" · ")}`);
  }
  return lines.join("\n");
}

/**
 * Render one canonical disposition set against the exact normalized producer findings it covers.
 *
 * @param input - Canonical set and complete producer finding array.
 * @returns One standalone deterministic Markdown report.
 */
export function renderDispositionReport(input: {
  dispositionSet: DispositionSet;
  producerFindings: readonly NormalizedReviewFinding[];
}): string {
  const dispositionSet = validateDispositionSet(input.dispositionSet);
  const producerFindings = NormalizedReviewFindingsSchema.parse(input.producerFindings);
  if (dispositionSet.findings.length !== producerFindings.length) {
    throw new Error("disposition report requires exact producer finding correspondence");
  }
  const byId = new Map(producerFindings.map((finding) => [finding.findingId, finding]));
  if (byId.size !== producerFindings.length) {
    throw new Error("disposition report requires unique producer finding identities");
  }
  const rendered = dispositionSet.findings.map((item, index) => {
    const finding = byId.get(item.findingId);
    if (finding === undefined) {
      throw new Error(`disposition finding '${item.findingId}' has no producer correspondence`);
    }
    validateCorrespondence(item, finding);
    return renderFinding(item, finding, index + 1);
  });
  return [`**Verification:** ${dispositionSet.proposedVerification}`, "", rendered.join("\n\n---\n\n")].join("\n");
}
