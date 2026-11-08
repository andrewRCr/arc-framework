/** The open records a cohort's Parent conflicts with under the Parent check's text comparisons. */
import type { CohortEvidence, CohortMemberEvidence } from "./check-support.js";

/** The open records that keep a cohort's proposed Parent from passing the Parent check. */
export interface CohortParentConflicts {
  /** Open cohorts whose Parent names this cohort, which a non-null Parent would nest below the one-level limit. */
  readonly nesting: readonly CohortEvidence[];
  /** Open members whose Cohort path names this cohort without agreeing with its Parent. */
  readonly members: readonly CohortMemberEvidence[];
}

/** Compare a cohort's proposed Parent with every open cohort and member by text, as the Parent check does.
 * @param name - The cohort's name in the proposed state.
 * @param parent - Its proposed Parent.
 * @param cohorts - Every open cohort in the proposed state.
 * @param members - Every open work unit's membership in the proposed state.
 * @returns The conflicting records, none where the Parent check admits the Parent.
 */
export function cohortParentConflicts(name: string, parent: string | null, cohorts: readonly CohortEvidence[],
  members: readonly CohortMemberEvidence[]): CohortParentConflicts {
  return { nesting: parent === null ? [] : cohorts.filter(({ fields }) => fields.parent === name),
    members: members.filter(member => !memberAgrees(member, name, parent, cohorts)) };
}

function memberAgrees(member: CohortMemberEvidence, name: string, parent: string | null, cohorts: readonly CohortEvidence[]): boolean {
  const parts = member.cohort?.split("/") ?? [];
  if (!parts.includes(name)) return true;
  if (parent !== null) return member.cohort === `${parent}/${name}`;
  return parts.length === 1 || (parts.length === 2 && parts[0] === name
    && cohorts.some(({ record, fields }) => record.reference.owner.name === parts[1] && fields.parent === name));
}
