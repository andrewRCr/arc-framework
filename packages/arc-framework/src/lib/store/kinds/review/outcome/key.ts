/** Stable single-segment storage identity for ended review attempts. */
import type { ReviewOutcome } from "./schema.js";

/** Return the attempt key, retaining hosted admission identity across acknowledgment. */
export function reviewOutcomeKey(value: ReviewOutcome): string {
  return value.hosted === undefined ? value.attemptId
    : value.hosted.admission.admissionId.replace(/^hosted-admission\//u, "hosted-admission-");
}
