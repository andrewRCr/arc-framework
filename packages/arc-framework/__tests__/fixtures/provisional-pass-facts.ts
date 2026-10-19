/** Explicit lane facts for pure provisional response boundaries. */
import type { ProvisionalStandardPassFacts } from "../../src/scripts/review-gate/runtime/provisional-pass-assessment.js";

export function provisionalPassFactsFixture(input: {
  completePasses: number; ceiling: number; chainAdequate?: boolean; delegatedAgentSelectable?: boolean;
  fixChecksSinceLastComplete?: ProvisionalStandardPassFacts["facts"]["fixChecksSinceLastComplete"];
}): ProvisionalStandardPassFacts {
  return { chainAdequate: input.chainAdequate ?? true, delegatedAgentSelectable: input.delegatedAgentSelectable ?? true,
    facts: { completePasses: input.completePasses, ceiling: input.ceiling, fixRounds: [], chainProven: false,
      rangeSize: { target: { kind: "unknown", reason: "git-failure" }, fix: null },
      fixChecksSinceLastComplete: input.fixChecksSinceLastComplete ?? [], materialTrend: [] } };
}
