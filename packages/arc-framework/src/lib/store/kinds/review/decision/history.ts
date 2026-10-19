/** Complete related-record observations used by decision admission. */
import type { BrokenRule, WriteCheckInput } from "../../../write-check.js";
import { brokenRule, observeRecords } from "../../rule-support.js";

export type DecisionCheckHistory<T> = { status: "known"; entries: readonly { key: string; value: T }[] }
  | { status: "unavailable"; rule: BrokenRule };

/** Read every related record or retain an actionable refusal instead of inventing an empty history. */
export async function readDecisionCheckHistory<T>(
  input: WriteCheckInput, kind: "review/decision" | "review/outcome",
  decode: (content: string) => { success: true; data: T } | { success: false; error: string },
): Promise<DecisionCheckHistory<T>> {
  const refuse = (condition: string): DecisionCheckHistory<T> => ({ status: "unavailable",
    rule: brokenRule("review.decision.complete-listing", `${kind} history: ${condition}`,
      "Restore the complete related-record listing and retry the decision write.") });
  const observed = await observeRecords(input.after, { family: "review", kind, owner: input.reference.owner });
  if (observed.status !== "known") return refuse(observed.status === "unavailable" ? observed.condition : "history was not enumerable");
  const entries: { key: string; value: T }[] = [];
  for (const record of observed.value) {
    const parsed = decode(record.content);
    if (!parsed.success || typeof record.reference.key !== "string") {
      return refuse(`record ${JSON.stringify(record.reference.key)}: ${parsed.success ? "missing key" : parsed.error}`);
    }
    entries.push({ key: record.reference.key, value: parsed.data });
  }
  return { status: "known", entries };
}
