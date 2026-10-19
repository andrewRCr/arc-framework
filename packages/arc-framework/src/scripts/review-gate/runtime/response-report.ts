/** Compose the human report from authoritative review facts and separate caller judgments. */
import type { ApprovedDispositionRecord } from "../core/advisory-records.js";
import type { ApprovedDispositionSet, ProposedDispositionSet } from "../core/disposition-records.js";
import { renderDispositionEvidence, renderDispositionReport } from "../core/disposition-report.js";
import type { NormalizedReviewFinding } from "../core/finding-records.js";
import { validateReviewFixTags, validateReviewReportInput, type ReviewFixTags, type ReviewReportInput } from "../core/review-report-inputs.js";
import { materialTrendText } from "../policy/next-pass-offer-text.js";
import { projectProvisionalPassAssessment, type ProvisionalStandardPassFacts } from "./provisional-pass-assessment.js";
import type { ReviewResult } from "../core/review-result.js";
import type { RespondCommandDependencies } from "./respond-command.js";

interface ProposedResponseReportInput {
  proposal: ProposedDispositionSet;
  producerFindings: readonly NormalizedReviewFinding[];
  assessment: ReturnType<typeof projectProvisionalPassAssessment>;
  report: ReviewReportInput;
  standardFacts: ProvisionalStandardPassFacts | undefined;
  hosted: boolean;
  readRecord(producerId: string): Promise<ApprovedDispositionRecord | null>;
}

function reportHeader(input: ProposedResponseReportInput): string {
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const finding of input.proposal.dispositionSet.findings) {
    if (finding.sourceVerification === "verified") counts[finding.verifiedSeverity] += 1;
  }
  const result = input.assessment.potentialStopReason
    ?? (input.assessment.proposedSignal.materialFix ? "not converged" : "converged");
  return `${input.assessment.summaryText} provisional · ${result}; `
    + `critical ${counts.critical}, major ${counts.major}, minor ${counts.minor}.`;
}

function reportDecisions(input: ProposedResponseReportInput): string[] {
  const consequence = input.assessment.fixConsequence;
  const lines = [`Approve the complete disposition set with ${input.proposal.dispositionSet.proposedVerification} verification?`];
  if (consequence.kind === "next-pass") {
    const round = (input.standardFacts?.facts.fixChecksSinceLastComplete
      .findIndex(look => look.producerId === input.proposal.dispositionSet.producerId) ?? -1) + 2;
    lines.push(consequence.coverage === "incremental-when-proven"
      ? `Fix-check offer: approve round ${round} since pass ${input.assessment.ceilingPassCount} after these repairs, `
        + "where its exact correction chain is proven. "
        + "A complete pass does not replace it."
      : `Successor offer: a ${input.assessment.lane === "frontline" ? "frontline" : "complete"} pass follows the performed fix `
        + "only with its separate named approval.");
  } else if (consequence.kind === "ceiling-decision") {
    lines.push("Another complete pass requires the Owner's explicit ceiling decision; fix checks do not spend that authority.");
  }
  lines.push(`Successor recommendation (advisory): ${input.report.successorRecommendation}`);
  return lines;
}

function loopReading(input: ProposedResponseReportInput): string[] {
  const trend = input.standardFacts === undefined
    ? `frontline pass ${input.assessment.admittedLogicalPass}: current provisional result`
    : materialTrendText(input.standardFacts.facts);
  return [`Material trend: ${trend === "" ? "no completed looks" : trend}.`,
    ...input.report.origin.map(group => `${group.origin}: ${group.findings} finding${group.findings === 1 ? "" : "s"}, `
      + `${group.newDesignFixes} new-design fix${group.newDesignFixes === 1 ? "" : "es"} (agent's reading).`),
    `${input.report.reading.kind}: ${input.report.reading.rationale}`];
}

function observedSignal(value: boolean | null): string { return value === null ? "unknown" : value ? "yes" : "no"; }

async function priorRoundReadings(input: ProposedResponseReportInput): Promise<string[]> {
  return Promise.all((input.standardFacts?.facts.fixRounds ?? []).map(async (round, index) => {
    const record = await input.readRecord(round.producerId);
    const node = record?.approvedDispositionLineage.find(entry =>
      entry.approvedDisposition.dispositionSet.dispositionSetId === round.dispositionSetId);
    const tags = node?.advisoryFixTags;
    const forecast = tags === undefined ? "not recorded"
      : `${tags.filter(tag => tag.tag === "new-design").length} new design, `
        + `${tags.filter(tag => tag.tag === "local-correction").length} local correction`;
    return `Round ${index + 1} observed signals: paths outside cited loci ${observedSignal(round.outsideCitedLoci)}, `
      + `added files ${observedSignal(round.addedFiles)}; stored forecast tags (advisory): ${forecast}.`;
  }));
}

/** Render unstored report judgments beside the canonical proposal and computed lane trend. */
export async function readProposedResponseReport(input: ProposedResponseReportInput): Promise<{
  dispositionReportText: string; dispositionEvidenceText: string;
}> {
  validateReviewReportInput(input.proposal.dispositionSet.findings, input.report);
  const reportInput = { dispositionSet: input.proposal.dispositionSet, producerFindings: input.producerFindings,
    headerLine: reportHeader(input), decisions: reportDecisions(input), tags: input.report.tags,
    fails: input.report.fails.map(anchor => ({ ...anchor,
      fails: input.hosted ? `Agent's reading: ${anchor.fails}` : anchor.fails })),
    loopReading: [...(await priorRoundReadings(input)), ...loopReading(input)] };
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
    headerLine: `Approved disposition set ${set.dispositionSetId}`, includeDecisions: false,
    ...(tags === undefined ? {} : { tags }) });
}
