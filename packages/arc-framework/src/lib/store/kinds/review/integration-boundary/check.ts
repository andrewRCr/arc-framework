/** Write admission for versioned publication boundaries. */
import type { BrokenRule, WriteCheckInput } from "../../../write-check.js";
import { brokenRule } from "../../rule-support.js";
import { parseReviewIntegrationBoundary } from "./parser.js";

/** Admit current boundary writes. */
export function checkReviewIntegrationBoundary(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const value = input.next === undefined ? null : parseReviewIntegrationBoundary(input.next.content);
  return Promise.resolve(value?.schemaVersion === 1 ? [brokenRule("review.integration-boundary.version",
    "Retained version-one publication boundaries are read-only.",
    "Regenerate this publication boundary in the current version-two format before retrying.")] : []);
}
