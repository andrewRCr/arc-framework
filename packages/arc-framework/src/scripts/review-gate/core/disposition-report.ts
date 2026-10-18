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
  fails?: string;
  tag?: "new-design" | "local-correction";
}

const TABLE_HEAD = ["| # | Grade | Finding | Action |", "|---|---|---|---|"];

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

/** The verified grade, with record-only standing retained in the decision table. */
function renderGrade(item: DispositionReportItem): string {
  if (item.sourceVerification === "not-supported") return "—";
  return displaySeverity(item.verifiedSeverity, item.verifiedNit)
    + (item.gating === "record-only" ? " · record-only" : "");
}

/** A fix tag is an advisory display note, never a different disposition. */
function renderAction(item: DispositionReportItem, tag?: ReportEntry["tag"]): string {
  return item.disposition === "fix" && tag !== undefined
    ? `FIX (${tag.replaceAll("-", " ")})` : item.disposition.toUpperCase();
}

/** The finding's labelled grade, title, and action. */
function renderRow({ label, item, tag }: ReportEntry): string {
  const title = item.title === undefined ? "—" : tableCell(item.title);
  return `| ${label} | ${renderGrade(item)} | ${title} | ${renderAction(item, tag)} |`;
}

/** Gather caller-owned decisions and every labelled finding question in one block. */
function renderDecisions(entries: readonly ReportEntry[], decisions: readonly string[] = []): string[] {
  const lines = [...decisions.map(line => `- ${escapeReviewFindingDisplayText(line)}`),
    ...entries.flatMap(({ label, item }) => item.openQuestions
      .map(question => `- ${label}: ${escapeReviewFindingDisplayText(question)}`))];
  return lines.length === 0 ? [] : ["**Decisions**", ...lines, ""];
}

/** One paragraph per descriptor field, so each scans on its own line once rendered. */
function renderSection({ label, item, fails, tag }: ReportEntry): string {
  const title = item.title === undefined ? "" : ` — ${escapeReviewFindingDisplayText(item.title)}`;
  const grade = item.sourceVerification === "not-supported" ? "—" : displaySeverity(item.verifiedSeverity, item.verifiedNit);
  const paragraphs = [`### ${label}${title}`, `${grade} · ${renderVerdict(item)} · ${renderAction(item, tag)}`];
  if (item.issue !== undefined) paragraphs.push(`**Finding:** ${escapeReviewFindingDisplayText(item.issue)}`);
  if (fails !== undefined) paragraphs.push(`**Fails:** ${escapeReviewFindingDisplayText(fails)}`);
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
  headerLine?: string;
  decisions?: readonly string[];
  fails?: readonly { findingId: string; fails: string }[];
  tags?: readonly { findingId: string; tag: "new-design" | "local-correction" }[];
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
    const fails = input.fails?.find(anchor => anchor.findingId === item.findingId)?.fails;
    const tag = input.tags?.find(note => note.findingId === item.findingId)?.tag;
    return { label: `F${index + 1}`, item, finding,
      ...(fails === undefined ? {} : { fails }), ...(tag === undefined ? {} : { tag }) };
  });
  entries.sort((left, right) => Number(left.item.gating !== "blocking") - Number(right.item.gating !== "blocking")
    || gradeRank(left.item) - gradeRank(right.item)
    || Number(right.tag === "new-design") - Number(left.tag === "new-design"));
  return { dispositionSet, entries };
}

/**
 * Render one labelled disposition set with its optional header, advisory notes, and complete decision block.
 *
 * @param input - Canonical set, exact producer findings, and optional presentation inputs.
 * @returns One standalone deterministic Markdown report, without the evidence block.
 */
export function renderDispositionReport(input: DispositionReportInput): string {
  const { dispositionSet, entries } = reportEntries(input);
  return [
    ...(input.headerLine === undefined ? [] : [escapeReviewFindingDisplayText(input.headerLine), ""]),
    `**Verification:** ${dispositionSet.proposedVerification}`,
    "",
    ...(input.tags === undefined || input.tags.length === 0 ? [] : ["**Fix tags:** agent's advisory reading.", ""]),
    ...TABLE_HEAD,
    ...entries.map(renderRow),
    "",
    ...renderDecisions(entries, input.decisions),
    entries.map(renderSection).join("\n\n---\n\n"),
  ].join("\n");
}

/**
 * Render the evidence behind one canonical disposition set, labelled as its report labels each finding.
 *
 * @param input - Canonical set, exact producer findings, and optional presentation inputs.
 * @returns One deterministic Markdown evidence block: locus, producer source, and ARC verification per finding.
 */
export function renderDispositionEvidence(input: DispositionReportInput): string {
  const { entries } = reportEntries(input);
  return ["**Evidence**", ...entries.map(renderEvidence)].join("\n");
}
