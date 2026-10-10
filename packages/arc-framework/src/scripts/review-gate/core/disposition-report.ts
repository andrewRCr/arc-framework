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

/** One rendered finding: its decision-order label, canonical item, and producer correspondence. */
interface ReportEntry {
  label: string;
  item: DispositionReportItem;
  finding: NormalizedReviewFinding;
}

const TABLE_HEAD = ["| # | Grade | Verdict | Action | Finding |", "|---|---|---|---|---|"];

/** ARC grade rank, most severe first; an unsupported finding carries no ARC grade and ranks last. */
function gradeRank(item: DispositionReportItem): number {
  if (item.sourceVerification === "not-supported") return 4;
  if (item.verifiedSeverity === "minor") return item.verifiedNit === true ? 3 : 2;
  return item.verifiedSeverity === "critical" ? 0 : 1;
}

/** Order canonical findings for the decision: blocking first, then by ARC grade, then canonical order. */
function decisionOrder(items: readonly DispositionReportItem[]): DispositionReportItem[] {
  return items
    .map((item, canonicalIndex) => ({ item, canonicalIndex }))
    .sort((left, right) => Number(left.item.gating !== "blocking") - Number(right.item.gating !== "blocking")
      || gradeRank(left.item) - gradeRank(right.item)
      || left.canonicalIndex - right.canonicalIndex)
    .map(({ item }) => item);
}

function renderVerdict(item: DispositionReportItem): string {
  const reviewer = displaySeverity(item.reportedSeverity, item.reportedNit);
  if (item.sourceVerification === "not-supported") {
    return `Not supported · reviewer graded ${reviewer} · ${item.gating}`;
  }
  const sameGrade = item.verifiedSeverity === item.reportedSeverity && item.verifiedNit === item.reportedNit;
  return `Confirmed · ${sameGrade ? "" : `reviewer graded ${reviewer} · `}${item.gating}`;
}

/** Display text for a table cell, where an unescaped `|` would open another cell. */
function tableCell(value: string): string {
  return escapeReviewFindingDisplayText(value).replaceAll("|", "\\|");
}

/** The finding's decision row: label, ARC grade, verdict with gating, disposition, and title. */
function renderRow({ label, item }: ReportEntry): string {
  const grade = item.sourceVerification === "not-supported"
    ? "—"
    : displaySeverity(item.verifiedSeverity, item.verifiedNit);
  const title = item.title === undefined ? "—" : tableCell(item.title);
  return `| ${label} | ${grade} | ${renderVerdict(item)} | ${item.disposition.toUpperCase()} | ${title} |`;
}

/** Every open question, labelled by its finding — the one part of the report that asks the approver. */
function renderOpenQuestions(entries: readonly ReportEntry[]): string[] {
  const questions = entries.flatMap(({ label, item }) => item.openQuestions
    .map((question) => `- ${label}: ${escapeReviewFindingDisplayText(question)}`));
  return questions.length === 0 ? [] : ["**Open questions**", ...questions, ""];
}

/** One paragraph per descriptor field, so each scans on its own line once rendered. */
function renderSection({ label, item }: ReportEntry): string {
  const title = item.title === undefined ? "" : ` — ${escapeReviewFindingDisplayText(item.title)}`;
  const paragraphs = [`### ${label}${title}`];
  if (item.issue !== undefined) paragraphs.push(`**Issue:** ${escapeReviewFindingDisplayText(item.issue)}`);
  paragraphs.push(
    `**Action:** ${escapeReviewFindingDisplayText(item.recommendation)}`,
    `**Detail:** ${escapeReviewFindingDisplayText(item.rationale)}`,
  );
  return paragraphs.join("\n\n");
}

/** The producer source, then ARC's own verification references, kept distinct on one line. */
function renderEvidence({ label, item, finding }: ReportEntry): string {
  const escapedLabel = finding.sourceLabel === undefined
    ? undefined
    : escapeReviewFindingDisplayText(finding.sourceLabel);
  const sourceLabel = escapedLabel === undefined
    ? ""
    : `${escapedLabel}${finding.sourceLabelTruncated === true ? "…" : ""} · `;
  return `- ${label} · ${escapeReviewFindingDisplayText(finding.locus)} · ${sourceLabel}`
    + `source #${finding.sourceOrdinal} · ${escapeReviewFindingDisplayText(finding.evidenceUrlOrId)}`
    + ` · verified at ${item.verificationRefs.map(escapeReviewFindingDisplayText).join(", ")}`;
}

function validateCorrespondence(item: DispositionReportItem, finding: NormalizedReviewFinding): void {
  if (item.locus !== finding.locus
    || item.reportedSeverity !== finding.severity
    || item.reportedNit !== finding.nit) {
    throw new Error(`disposition finding '${item.findingId}' does not match its producer finding`);
  }
}

/** A canonical disposition set and the exact normalized producer findings it covers. */
interface DispositionReportInput {
  dispositionSet: DispositionSet;
  producerFindings: readonly NormalizedReviewFinding[];
}

/** Validate exact producer correspondence and label each finding in decision order. */
function reportEntries(input: DispositionReportInput): { dispositionSet: DispositionSet; entries: ReportEntry[] } {
  const dispositionSet = validateDispositionSet(input.dispositionSet);
  const producerFindings = NormalizedReviewFindingsSchema.parse(input.producerFindings);
  if (dispositionSet.findings.length !== producerFindings.length) {
    throw new Error("disposition report requires exact producer finding correspondence");
  }
  const byId = new Map(producerFindings.map((finding) => [finding.findingId, finding]));
  if (byId.size !== producerFindings.length) {
    throw new Error("disposition report requires unique producer finding identities");
  }
  const entries = decisionOrder(dispositionSet.findings).map((item, index): ReportEntry => {
    const finding = byId.get(item.findingId);
    if (finding === undefined) {
      throw new Error(`disposition finding '${item.findingId}' has no producer correspondence`);
    }
    validateCorrespondence(item, finding);
    return { label: `F${index + 1}`, item, finding };
  });
  return { dispositionSet, entries };
}

/**
 * Render the decision view of one canonical disposition set: the table, open questions, and one section per finding.
 *
 * @param input - Canonical set and complete producer finding array.
 * @returns One standalone deterministic Markdown report, without the evidence block.
 */
export function renderDispositionReport(input: DispositionReportInput): string {
  const { dispositionSet, entries } = reportEntries(input);
  return [
    `**Verification:** ${dispositionSet.proposedVerification}`,
    "",
    ...TABLE_HEAD,
    ...entries.map(renderRow),
    "",
    ...renderOpenQuestions(entries),
    entries.map(renderSection).join("\n\n---\n\n"),
  ].join("\n");
}

/**
 * Render the evidence behind one canonical disposition set, labelled as its report labels each finding.
 *
 * @param input - Canonical set and complete producer finding array.
 * @returns One deterministic Markdown evidence block: locus, producer source, and ARC verification per finding.
 */
export function renderDispositionEvidence(input: DispositionReportInput): string {
  const { entries } = reportEntries(input);
  return ["**Evidence**", ...entries.map(renderEvidence)].join("\n");
}
