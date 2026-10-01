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

/** The finding's one-line head: report label, ARC grade, disposition, and title when one was authored. */
function renderHead(item: DispositionReportItem, reportOrdinal: number): string {
  const grade = item.sourceVerification === "not-supported"
    ? "not supported"
    : displaySeverity(item.verifiedSeverity, item.verifiedNit);
  const title = item.title === undefined ? "" : ` — ${escapeReviewFindingDisplayText(item.title)}`;
  return `F${reportOrdinal} · ${grade} · ${item.disposition.toUpperCase()}${title}`;
}

function renderVerdict(item: DispositionReportItem): string {
  const reviewer = displaySeverity(item.reportedSeverity, item.reportedNit);
  if (item.sourceVerification === "not-supported") {
    return `**Verdict:** Not supported · reviewer graded ${reviewer} · ${item.gating}`;
  }
  const sameGrade = item.verifiedSeverity === item.reportedSeverity && item.verifiedNit === item.reportedNit;
  return `**Verdict:** Confirmed · ${sameGrade ? "" : `reviewer graded ${reviewer} · `}${item.gating}`;
}

function renderSource(finding: NormalizedReviewFinding): string {
  const escapedLabel = finding.sourceLabel === undefined
    ? undefined
    : escapeReviewFindingDisplayText(finding.sourceLabel);
  const escapedReference = escapeReviewFindingDisplayText(finding.evidenceUrlOrId);
  const label = escapedLabel === undefined
    ? ""
    : `${escapedLabel}${finding.sourceLabelTruncated === true ? "…" : ""} · `;
  return `**Source:** ${escapeReviewFindingDisplayText(finding.locus)} · ${label}`
    + `source #${finding.sourceOrdinal} · ${escapedReference}`;
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
  const lines = [`### ${renderHead(item, reportOrdinal)}`];
  if (item.issue !== undefined) lines.push(`**Issue:** ${escapeReviewFindingDisplayText(item.issue)}`);
  lines.push(
    renderVerdict(item),
    `**Action:** ${escapeReviewFindingDisplayText(item.recommendation)}`,
    `**Detail:** ${escapeReviewFindingDisplayText(item.rationale)}`,
  );
  if (item.openQuestions.length > 0) {
    lines.push(`**Open questions:** ${item.openQuestions
      .map(escapeReviewFindingDisplayText).join(" · ")}`);
  }
  lines.push(
    renderSource(finding),
    `**Verified at:** ${item.verificationRefs.map(escapeReviewFindingDisplayText).join(" · ")}`,
  );
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
  const index = dispositionSet.findings.length > 1
    ? [dispositionSet.findings.map((item, position) => `- ${renderHead(item, position + 1)}`).join("\n"), ""]
    : [];
  return [
    `**Verification:** ${dispositionSet.proposedVerification}`,
    "",
    ...index,
    rendered.join("\n\n---\n\n"),
  ].join("\n");
}
