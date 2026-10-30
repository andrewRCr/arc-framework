/** Write admission for versioned publication boundaries. */
import type { BrokenRule, WriteCheckInput } from "../../../write-check.js";
import { parseReviewIntegrationBoundary } from "./parser.js";

/** Admit current boundary writes. */
export function checkReviewIntegrationBoundary(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const value = input.next === undefined ? null : parseReviewIntegrationBoundary(input.next.content);
  return Promise.resolve(value?.schemaVersion === 1 ? [{ rule: "review.integration-boundary.version",
    condition: "Retained version-one publication boundaries are read-only.",
    remedy: { text: `Run arc review pre-publication ${value.workUnit} to record its boundary in the current version-two format, then retry.`,
      argv: ["arc", "review", "pre-publication", value.workUnit] } }] : []);
}
