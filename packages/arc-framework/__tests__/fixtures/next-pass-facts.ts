/** Coherent computed-fact values for pure offer rendering and coverage-selection tests. */
import { NextPassFactsSchema } from "../../src/scripts/review-gate/policy/next-pass-facts-schema.js";

export function nextPassFactsFixture() {
  const complete = { producerId: "complete-1", logicalPass: 1, coverage: "complete" as const, outcome: "findings" };
  const check = { producerId: "fix-check-1", logicalPass: 2, coverage: "fix-check" as const, outcome: "findings" };
  return NextPassFactsSchema.parse({ completePasses: 1, ceiling: 4, chainProven: true,
    fixChecksSinceLastComplete: [check], materialTrend: [
      { ...complete, materialCount: 2, provisional: false }, { ...check, materialCount: 1, provisional: false }],
    rangeSize: { target: { kind: "known", metrics: { lines: 100, files: 10 } },
      fix: { kind: "known", metrics: { lines: 5, files: 1 } } },
    fixRounds: [{ producerId: "complete-1", dispositionSetId: `sha256:${"a".repeat(64)}`,
      originatingHeadSha: "a".repeat(40), producedHeadSha: "b".repeat(40), outsideCitedLoci: false, addedFiles: false },
    { producerId: "fix-check-1", dispositionSetId: `sha256:${"b".repeat(64)}`,
      originatingHeadSha: "b".repeat(40), producedHeadSha: "c".repeat(40), outsideCitedLoci: true, addedFiles: true }],
  });
}
