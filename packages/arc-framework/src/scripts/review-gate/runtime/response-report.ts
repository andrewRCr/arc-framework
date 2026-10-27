/** Compose the human report from authoritative review facts and separate caller judgments. */
import type { ApprovedDispositionRecord } from "../core/advisory-records.js";
import type { ApprovedDispositionSet, ProposedDispositionSet } from "../core/disposition-records.js";
import { renderDispositionEvidence, renderDispositionReport } from "../core/disposition-report.js";
import type { NormalizedReviewFinding } from "../core/finding-records.js";
import { validateReviewFixTags, validateReviewReportInput, type ReviewFixTags, type ReviewReportInput } from "../core/review-report-inputs.js";
import { criticalMajorSeries, trendLooks } from "../policy/next-pass-offer-text.js";
import { projectProvisionalPassAssessment, type ProvisionalStandardPassFacts } from "./provisional-pass-assessment.js";
import type { ReviewResult } from "../core/review-result.js";
import type { RespondCommandDependencies } from "./respond-command.js";

/** What approving a proposal releases beyond its fixes, as the caller's interlocks and hosted plan decide. */
export interface ResponseApprovalRelease {
  /** Approval releases the fix commit, then its push. */
  commit: boolean;
  push: boolean;
  /** Hosted threads settled by approval alone, and those settled once the fix is pushed; null when unknown. */
  threads: { beforeFix: number; afterFix: number } | null;
}

interface ProposedResponseReportInput {
  proposal: ProposedDispositionSet;
  release: ResponseApprovalRelease;
  producerFindings: readonly NormalizedReviewFinding[];
  assessment: ReturnType<typeof projectProvisionalPassAssessment>;
  report: ReviewReportInput;
  standardFacts: ProvisionalStandardPassFacts | undefined;
}

const GRADE_SYMBOL = { critical: "🔴", major: "🟠", minor: "🟡" } as const;

function plural(count: number, noun: string, suffix = "s"): string {
  return `${count} ${noun}${count === 1 ? "" : suffix}`;
}

/** The lane position, then each verified grade's count and any unsupported count; a zero count says nothing. */
function reportHeader(input: ProposedResponseReportInput): { title: string; details: string[] } {
  const counts = { critical: 0, major: 0, minor: 0 };
  let unsupported = 0;
  for (const finding of input.proposal.dispositionSet.findings) {
    if (finding.sourceVerification === "verified") counts[finding.verifiedSeverity] += 1;
    else unsupported += 1;
  }
  const details = (["critical", "major", "minor"] as const).filter(grade => counts[grade] > 0)
    .map(grade => `${GRADE_SYMBOL[grade]} ${counts[grade]} ${grade}`);
  return { title: input.assessment.positionText, details: unsupported === 0 ? details : [...details, `${unsupported} not supported`] };
}

/** The looks a fix leaves the lane, then the agent's labelled recommendation, a decision apart from approval. */
function reportDecisions(input: ProposedResponseReportInput): string[] {
  const next = input.assessment.nextActivityText;
  const recommendation = input.report.successorRecommendation;
  return [`${next === null ? "" : `After the fix: ${next}. `}Recommended: ${recommendation}`];
}

/** Ask for the set's approval, naming what it releases and never the next pass, which approval leaves open. */
function reportCloser(input: ProposedResponseReportInput): string {
  const set = input.proposal.dispositionSet;
  const counts = { fix: 0, defer: 0, reject: 0 };
  for (const finding of set.findings) counts[finding.disposition] += 1;
  const actions = (["fix", "defer", "reject"] as const).filter(action => counts[action] > 0)
    .map(action => plural(counts[action], action, action === "fix" ? "es" : "s"));
  const { commit, push, threads } = input.release;
  const fixSteps = counts.fix === 0 ? []
    : [`${set.proposedVerification} verification`, ...(commit ? ["commit"] : []), ...(commit && push ? ["push"] : [])];
  const settled = threads === null ? 0 : threads.beforeFix + (commit && push ? threads.afterFix : 0);
  const settleSteps = settled === 0 ? [] : [`settle ${plural(settled, "thread")}`];
  return `Approve: ${[actions.join(", "), ...fixSteps, ...settleSteps].join(" → ")}?`;
}

/** The agent's reading of a lane with two or more looks, over the series of its critical and major counts. */
function reportTrend(input: ProposedResponseReportInput): { reading: string; series: string[] } | undefined {
  const facts = input.standardFacts?.facts;
  if (facts === undefined || trendLooks(facts).length < 2) return undefined;
  return { reading: `${input.report.reading.kind} — ${input.report.reading.rationale}`, series: criticalMajorSeries(facts) };
}

/** Render unstored report judgments beside the canonical proposal and computed lane trend. */
export function readProposedResponseReport(input: ProposedResponseReportInput): {
  dispositionReportText: string; dispositionEvidenceText: string;
} {
  validateReviewReportInput(input.proposal.dispositionSet.findings, input.report);
  const trend = reportTrend(input);
  const reportInput = { dispositionSet: input.proposal.dispositionSet, producerFindings: input.producerFindings,
    header: reportHeader(input), decisions: reportDecisions(input), closer: reportCloser(input), tags: input.report.tags,
    fails: input.report.fails, ...(trend === undefined ? {} : { trend }) };
  return { dispositionReportText: renderDispositionReport(reportInput),
    dispositionEvidenceText: renderDispositionEvidence(reportInput) };
}

/** Read the same lane facts used by both the provisional assessment and its report. */
export async function readResponsePassAssessment(
  result: ReviewResult, proposal: ProposedDispositionSet,
  dependencies: Pick<RespondCommandDependencies, "readConfiguredLanePolicy" | "readProvisionalPassFacts">,
) {
  const lane = result.kind === "frontline" ? "frontline" : "standard";
  const configured = await dependencies.readConfiguredLanePolicy(lane);
  // Frontline follow-up reads the pass and ceiling its outcome recorded, not the configuration current now.
  const passPosition = result.kind === "frontline"
    ? { admittedLogicalPass: result.outcome.pass, configuredMaxPasses: result.outcome.maxPasses }
    : { admittedLogicalPass: result.admission.logicalPass, configuredMaxPasses: configured.maxPasses };
  const standardFacts = lane === "frontline" ? undefined : await dependencies.readProvisionalPassFacts({
    result, proposal, configuredSources: configured.sources, configuredMaxPasses: configured.maxPasses,
  });
  return { standardFacts, assessment: projectProvisionalPassAssessment({ proposal, result, lane, ...passPosition,
    ...(standardFacts === undefined ? {} : { standardFacts }) }) };
}


/** Read immutable stored tags for an approved, verified-fix, or settlement-replay report. */
export async function readApprovedResponseReport(input: {
  dispositions: ApprovedDispositionSet;
  producerFindings: readonly NormalizedReviewFinding[];
  producerId: string;
  incomingTags: ReviewFixTags | undefined;
  settlementReplay: boolean;
  readRecord(producerId: string): Promise<ApprovedDispositionRecord | null>;
}): Promise<string> {
  const record = await input.readRecord(input.producerId);
  const set = input.dispositions.dispositionSet;
  const node = record?.approvedDispositionLineage.find(entry =>
    entry.approvedDisposition.dispositionSet.dispositionSetId === set.dispositionSetId);
  if (input.incomingTags !== undefined || (node === undefined && !input.settlementReplay)) {
    validateReviewFixTags(set.findings, input.incomingTags ?? []);
  }
  const tags = node === undefined ? input.incomingTags : node.advisoryFixTags;
  return renderDispositionReport({ dispositionSet: set, producerFindings: input.producerFindings,
    header: { title: `Approved disposition set ${set.dispositionSetId}`, details: [`${set.proposedVerification} verification`] },
    includeDecisions: false,
    ...(tags === undefined ? {} : { tags }) });
}
