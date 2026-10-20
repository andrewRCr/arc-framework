/** Compose the human report from authoritative review facts and separate caller judgments. */
import type { ApprovedDispositionRecord } from "../core/advisory-records.js";
import type { ApprovedDispositionSet, ProposedDispositionSet } from "../core/disposition-records.js";
import { renderDispositionEvidence, renderDispositionReport } from "../core/disposition-report.js";
import type { NormalizedReviewFinding } from "../core/finding-records.js";
import { validateReviewFixTags, validateReviewReportInput, type ReviewFixTags, type ReviewReportInput } from "../core/review-report-inputs.js";
import { materialTrendEntries } from "../policy/next-pass-offer-text.js";
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
  readRecord(producerId: string): Promise<ApprovedDispositionRecord | null>;
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

/** The computed next step a fix creates beside the agent's recommendation for it, a decision apart from approval. */
function reportDecisions(input: ProposedResponseReportInput): string[] {
  const next = input.assessment.nextActivityText;
  const recommendation = input.report.successorRecommendation;
  return [next === null ? `Next: ${recommendation}` : `After the fix: ${next}. ${recommendation}`];
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

/** One entry per look, in lane order; the current look's provisional count replaces its unapproved one. */
function trendLooks(facts: NonNullable<ProposedResponseReportInput["standardFacts"]>["facts"]) {
  const looks = new Map<string, ReturnType<typeof materialTrendEntries>[number]>();
  for (const entry of materialTrendEntries(facts)) looks.set(entry.producerId, entry);
  return [...looks.values()];
}

/** A performed round's observed change signals, named only when one fired, beside the tags it forecast. */
async function firedRoundSignals(input: ProposedResponseReportInput,
  facts: NonNullable<ProposedResponseReportInput["standardFacts"]>["facts"]): Promise<string[]> {
  const lines = await Promise.all(facts.fixRounds.map(async (round, index) => {
    const fired = [round.outsideCitedLoci === true ? "changed paths outside the cited loci" : undefined,
      round.addedFiles === true ? "added files" : undefined].filter(signal => signal !== undefined);
    if (fired.length === 0) return undefined;
    const record = await input.readRecord(round.producerId);
    const tags = record?.approvedDispositionLineage.find(entry =>
      entry.approvedDisposition.dispositionSet.dispositionSetId === round.dispositionSetId)?.advisoryFixTags;
    const forecast = tags === undefined ? ""
      : `; its tags forecast ${tags.filter(tag => tag.tag === "new-design").length} new design, `
        + `${tags.filter(tag => tag.tag === "local-correction").length} local correction`;
    return `Round ${index + 1} ${fired.join(" and ")}${forecast}.`;
  }));
  return lines.filter(line => line !== undefined);
}

/** The agent's reading of a lane with two or more looks, over its looks, origins, and fired round signals. */
async function reportTrend(input: ProposedResponseReportInput): Promise<{ reading: string; lines: string[] } | undefined> {
  const facts = input.standardFacts?.facts;
  if (facts === undefined) return undefined;
  const looks = trendLooks(facts);
  if (looks.length < 2) return undefined;
  const origins = input.report.origin.map(group =>
    `${group.origin} ${plural(group.findings, "finding")}, ${plural(group.newDesignFixes, "new-design fix", "es")}`);
  return {
    reading: `${input.report.reading.kind} — ${input.report.reading.rationale}`,
    lines: [
      `Looks: ${looks.map(look => `${look.position}: ${look.materialCount ?? "unknown"} material`
        + (look.provisional ? " (provisional)" : "")).join(" → ")}`,
      ...(origins.length === 0 ? [] : [`Origins: ${origins.join("; ")}`]),
      ...await firedRoundSignals(input, facts),
    ],
  };
}

/** Render unstored report judgments beside the canonical proposal and computed lane trend. */
export async function readProposedResponseReport(input: ProposedResponseReportInput): Promise<{
  dispositionReportText: string; dispositionEvidenceText: string;
}> {
  validateReviewReportInput(input.proposal.dispositionSet.findings, input.report);
  const trend = await reportTrend(input);
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
