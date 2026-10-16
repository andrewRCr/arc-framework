/** Complete pure cohort integrity catalog over a proposed batch. */
import { checkCohortPurpose, checkCohortParent, checkCohortOpenMembers, checkCohortArchiveCloseout } from "./rules.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Collect every Purpose, Parent, and open-member violation.
 * @param input - Cohort versions and complete store views.
 * @returns Every broken rule, or an empty result admitting the write.
 */
export async function checkCohortDocument(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const observed = await Promise.all([checkCohortParent(input), checkCohortOpenMembers(input), checkCohortArchiveCloseout(input)]);
  return [...checkCohortPurpose(input), ...observed.flat()];
}
