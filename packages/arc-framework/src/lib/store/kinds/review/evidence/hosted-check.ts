/** Coverage of sealed hosted findings by one approved response's settlement. */
import { canonicalize } from "../../../../kernel/index.js";
import type { BrokenRule } from "../../../write-check.js";
import { brokenRule } from "../../rule-support.js";
import type { ReviewOutcome } from "../outcome/schema.js";
import type { ReviewEvidence } from "./schema.js";

/** Require actions for exactly the sealed findings and no settlement outside them. */
export function checkHostedEvidence(value: ReviewEvidence, outcome: ReviewOutcome): readonly BrokenRule[] {
  if (outcome.hosted === undefined) return [];
  const findings = outcome.hosted.sealedResult?.findings.map(({ findingId }) => findingId).sort();
  const actions = value.settlement?.findingActions.map(({ findingId }) => findingId).sort();
  if (findings !== undefined && actions !== undefined && canonicalize(findings) === canonicalize(actions)
    && value.settlement?.evidence.every(({ findingId }) => findings.includes(findingId))) return [];
  return [brokenRule("review.evidence.hosted-findings", "Hosted response actions must cover exactly the producer's sealed findings.",
    "Restore actions for every sealed finding and remove settlement for findings outside that result.")];
}
