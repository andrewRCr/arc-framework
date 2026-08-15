/** Composition of the pull request's `## Review` section from approved review dispositions. */

import type { ApprovedDispositionRecord } from "../review-gate/core/advisory-records.js";
import type { DispositionReportItem } from "../review-gate/core/disposition-records.js";

const DISPOSITION_LABELS = [
  ["fix", "addressed"],
  ["reject", "declined"],
  ["defer", "deferred"],
] as const;

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sourceIdentities(records: readonly ApprovedDispositionRecord[]): string {
  return distinct(records.flatMap(
    (record) => record.approvedDisposition.dispositionSet.findings.map(({ sourceIdentity }) => sourceIdentity),
  )).join(", ");
}

function laneLine(
  records: readonly ApprovedDispositionRecord[],
  noun: string,
  plural: string,
): string {
  if (records.length === 0) return "None";
  return `${sourceIdentities(records)} — ${records.length} ${records.length === 1 ? noun : plural}`;
}

/**
 * Reduce every approved set to one final disposition per finding.
 *
 * Records arrive in Candidate lineage order, so a finding carried across passes keeps the
 * disposition its last approved set gave it.
 */
function finalDispositions(records: readonly ApprovedDispositionRecord[]): DispositionReportItem[] {
  const byFinding = new Map<string, DispositionReportItem>();
  for (const record of records) {
    for (const finding of record.approvedDisposition.dispositionSet.findings) {
      byFinding.set(finding.findingId, finding);
    }
  }
  return [...byFinding.values()].filter((finding) => finding.nit !== true);
}

function triageCounts(findings: readonly DispositionReportItem[]): string {
  if (findings.length === 0) return "no material findings";
  const counted = DISPOSITION_LABELS.flatMap(([disposition, label]) => {
    const count = findings.filter((finding) => finding.disposition === disposition).length;
    return count === 0 ? [] : [`${count} ${label}`];
  });
  return [...counted, "0 unresolved"].join(", ");
}

/**
 * Compose the record the approver previews at the checkpoint and the merge verb posts verbatim.
 *
 * The two lane lines report only what the durable disposition records establish: the attested local
 * lane and the frontline lane are the two source kinds an approved set can carry. Findings settled
 * directly on hosted review threads never become approved disposition records, so they do not reach
 * this composition.
 *
 * @param records - Approved disposition records in Candidate lineage order; must be non-empty.
 * @returns Markdown beginning with the `## Review` heading the merge verb splices into the body.
 */
export function composeReviewRecordMarkdown(records: readonly ApprovedDispositionRecord[]): string {
  if (records.length === 0) {
    throw new Error("A review record requires at least one approved disposition record.");
  }
  const local = records.filter((record) => record.source.kind === "attested-local");
  const frontline = records.filter((record) => record.source.kind === "frontline");
  const approvers = distinct(records.map((record) => `@${record.approvedDisposition.approval.approvedBy}`));
  return [
    "## Review",
    "",
    `- **Local:** ${laneLine(local, "pass", "passes")}`,
    `- **Hosted PR:** ${laneLine(frontline, "review", "reviews")}`,
    `- **Triage:** ${approvers.join(", ")} — ${triageCounts(finalDispositions(records))}`,
    "",
  ].join("\n");
}
