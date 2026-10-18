/** Pure provisional response assessment from immutable results and lane facts. */
import type { z } from "zod";
import type { ProposedDispositionSet } from "../core/disposition-records.js";
import type { ReviewResult } from "../core/review-result.js";
import type { ReviewSeveritySchema } from "../core/review-primitives.js";
import { fixesMaterialFinding } from "../core/review-convergence.js";
import { ProvisionalPassAssessmentSchema, type ProvisionalFixConsequence } from "../core/provisional-pass-assessment.js";
import type { NextPassFacts } from "../policy/next-pass-facts.js";
import { projectFixConsequence } from "./fix-consequence.js";

/** Repository facts used to predict the standard lane's position and possible fix check. */
export interface ProvisionalStandardPassFacts {
  readonly facts: NextPassFacts;
  readonly chainAdequate: boolean;
  readonly delegatedAgentSelectable: boolean;
}

function fixConsequenceText(
  consequence: ProvisionalFixConsequence,
  lane: "frontline" | "standard",
  nextPass: string,
): string {
  switch (consequence.kind) {
    case "no-fix":
      return "";
    case "lane-closes":
      return ` Approving a FIX moves the head without another ${lane} pass.`;
    case "next-pass": {
      const coverage = consequence.coverage === null ? ""
        : consequence.coverage === "complete" ? ", with complete coverage"
          : ", covering only the fix where its chain is proven";
      return ` Approving a FIX moves the head, which needs ${lane} pass ${nextPass}${coverage}.`;
    }
    case "ceiling-decision":
      return " Approving a FIX moves the head, and another pass needs a ceiling decision.";
    case "decided-at-fixed-head":
      return " Approving a FIX moves the head; review status there decides whether another pass is needed.";
  }
}

function proposedReviewSignal(proposal: ProposedDispositionSet) {
  const severityRank = { minor: 1, major: 2, critical: 3 } as const;
  let confirmedFindingCount = 0;
  let maxConfirmedSeverity: z.infer<typeof ReviewSeveritySchema> | null = null;
  for (const finding of proposal.dispositionSet.findings) {
    if (finding.sourceVerification !== "verified") continue;
    confirmedFindingCount += 1;
    if (maxConfirmedSeverity === null
      || severityRank[finding.verifiedSeverity] > severityRank[maxConfirmedSeverity]) {
      maxConfirmedSeverity = finding.verifiedSeverity;
    }
  }
  return { confirmedFindingCount, maxConfirmedSeverity, materialFix: fixesMaterialFinding(proposal.dispositionSet.findings) };
}

/** Project a proposal against repository-derived standard facts or the recorded frontline ordinal. */
export function projectProvisionalPassAssessment(input: {
  proposal: ProposedDispositionSet;
  lane: "frontline" | "standard";
  result: ReviewResult;
  admittedLogicalPass: number;
  configuredMaxPasses: number;
  configuredSources: readonly string[];
  standardFacts?: ProvisionalStandardPassFacts;
}): z.infer<typeof ProvisionalPassAssessmentSchema> {
  const proposedSignal = proposedReviewSignal(input.proposal);
  const { confirmedFindingCount, maxConfirmedSeverity, materialFix } = proposedSignal;
  if (input.lane === "standard" && input.standardFacts === undefined) throw new Error("standard pass facts are required");
  const ceilingPassCount = input.lane === "frontline" ? input.admittedLogicalPass : input.standardFacts?.facts.completePasses ?? input.admittedLogicalPass;
  const capPosition = ceilingPassCount < input.configuredMaxPasses
    ? "below-ceiling" as const
    : ceilingPassCount === input.configuredMaxPasses
      ? "at-ceiling" as const
      : "above-ceiling" as const;
  const fixConsequence = projectFixConsequence({
    proposal: input.proposal,
    result: input.result,
    configuredSources: input.configuredSources,
    materialFix,
    belowCeiling: capPosition === "below-ceiling",
  });
  const potentialStopReason = fixConsequence.kind === "ceiling-decision" ? "cap-exhausted" as const : null;
  const severitySymbol = { minor: "🟡", major: "🟠", critical: "🔴" } as const;
  const signalText = maxConfirmedSeverity === null
    ? "No confirmed findings."
    : `${confirmedFindingCount} confirmed finding${confirmedFindingCount === 1 ? "" : "s"}, `
      + `highest ${severitySymbol[maxConfirmedSeverity]} ${maxConfirmedSeverity}.`;
  const positionText = { "below-ceiling": "", "at-ceiling": " (limit reached)", "above-ceiling": " (over the limit)" }[
    capPosition
  ];
  const consequenceText = fixConsequenceText(
    fixConsequence,
    input.lane,
    `${input.admittedLogicalPass + 1} of ${input.configuredMaxPasses}`,
  );
  const laneText = input.lane === "standard" ? "Standard" : "Frontline";
  return ProvisionalPassAssessmentSchema.parse({
    status: "provisional",
    lane: input.lane,
    admittedLogicalPass: input.admittedLogicalPass,
    ceilingPassCount,
    configuredMaxPasses: input.configuredMaxPasses,
    proposedSignal,
    capPosition,
    fixConsequence,
    potentialStopReason,
    nextPassAuthority: "none",
    summaryText: `${laneText} pass ${input.admittedLogicalPass} of ${input.configuredMaxPasses}${positionText}. `
      + `${signalText}${consequenceText}`,
  });
}

