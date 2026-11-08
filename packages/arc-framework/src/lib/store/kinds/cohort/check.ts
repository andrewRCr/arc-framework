/** Complete pure cohort integrity catalog over a proposed batch. */
import { checkCohortPurpose, checkCohortParent, checkCohortOpenMembers, checkCohortRemoveHoldings, checkCohortArchiveCloseout } from "./rules.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
import { checkPreparedRename } from "../../rename-admission.js";
/** Collect every Purpose, Parent, retention, and archive-closeout violation.
 * @param input - Cohort versions and complete store views.
 * @returns Every broken rule, or an empty result admitting the write.
 */
export async function checkCohortDocument(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const observed = await Promise.all([checkCohortParent(input), checkCohortOpenMembers(input), checkCohortRemoveHoldings(input), checkCohortArchiveCloseout(input), checkPreparedRename(input)]);
  return [...checkCohortPurpose(input), ...observed.flat()];
}
