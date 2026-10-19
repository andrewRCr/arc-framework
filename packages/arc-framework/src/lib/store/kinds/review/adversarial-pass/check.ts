/** Key binding for immutable advisory adversarial passes. */
import type { BrokenRule, WriteCheckInput } from "../../../write-check.js";
import { brokenRule } from "../../rule-support.js";
import { parseReviewAdversarialPass } from "./parser.js";

/** Check the activity in the global pass key independently of the within-loop pass ordinal. */
export function checkReviewAdversarialPass(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.next === undefined) return Promise.resolve([]);
  const value = parseReviewAdversarialPass(input.next.content);
  if (value === null) return Promise.resolve([]);
  const key = input.reference.key;
  return Promise.resolve(typeof key === "object" && key.activity === value.activity ? [] : [brokenRule("review.adversarial-pass.key",
    "The pass key's activity differs from its recorded review activity.", "Store the pass under this activity's next global pass number.")]);
}
