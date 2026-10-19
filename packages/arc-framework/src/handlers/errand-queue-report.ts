/** Human Errand output retains every reported queue member and its supplied repair. */
import type { QueueOfferProblem } from "../lib/inbox/offer.js";

/** Append qualified queue reports without changing the machine result or an empty report's narration. */
export function formatErrandQueueReport(result: {
  recommendedPromptText: string;
  leftOut?: readonly QueueOfferProblem[];
  skipped?: readonly QueueOfferProblem[];
}): string {
  const lines = [result.recommendedPromptText];
  for (const [label, problems] of [["Left out", result.leftOut ?? []], ["Skipped", result.skipped ?? []]] as const) {
    for (const problem of problems) lines.push(`${label} ${problem.inbox}:${problem.id}: ${problem.reason} ${problem.remedy.text}`);
  }
  return lines.join("\n");
}
