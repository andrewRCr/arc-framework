/** Native decision consumption is observed from ended outcomes or pending execution citations. */
import type { NativeReviewFactPorts, ReviewOperationStateSnapshotIndex } from "../core/ports.js";
import { reviewFactListingError } from "../../../lib/store/kinds/review/fact-access.js";

/** Require complete observations before deciding whether any named grant has been consumed. */
export async function nativeReviewDecisionWasConsumed(facts: Pick<NativeReviewFactPorts, "outcomes">,
  inFlight: ReviewOperationStateSnapshotIndex, decisionKeys: ReadonlySet<string>): Promise<boolean> {
  if (decisionKeys.size === 0) return false;
  const outcomes = await facts.outcomes.list();
  if (outcomes.status !== "complete") throw reviewFactListingError(outcomes);
  if (outcomes.records.some(record => record.value.admittedBy !== undefined && decisionKeys.has(record.value.admittedBy))) return true;
  const snapshot = await inFlight.readOperationSnapshot();
  if (snapshot.status !== "complete") throw new Error(`Restore the native execution snapshot and retry: ${snapshot.reason}`);
  return snapshot.records.some(({ state }) => state.kind === "lane-progress"
    && state.attempts.some(attempt => attempt.outcome === "pending" && attempt.admittedBy !== undefined && decisionKeys.has(attempt.admittedBy)));
}
