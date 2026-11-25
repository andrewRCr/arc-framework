/** The Parent check's conditions on a proposed Parent: the cohort it names, and the open records it conflicts with. */
import type { StoreRecord } from "../../read.js";
import type { CohortEvidence, CohortMemberEvidence } from "./check-support.js";
import { parseCohortDocument } from "./parser.js";

/** Why the Parent check refuses the cohort a Parent names as a parent, once the name resolves to it. */
export type NamedParentProblem = { readonly kind: "completed" } | { readonly kind: "nested"; readonly parent: string }
  | { readonly kind: "malformed"; readonly error: string };

/** Hold the cohort a Parent names to the Parent check's own conditions on a parent: open, and top-level.
 * @param parent - The named cohort as it stands in the proposed state.
 * @returns The condition it fails, or undefined where the Parent check admits it as a parent.
 */
export function namedParentProblem(parent: Pick<StoreRecord, "placement" | "content">): NamedParentProblem | undefined {
  if (parent.placement?.kind === "completed") return { kind: "completed" };
  const parsed = parseCohortDocument(parent.content);
  if (!parsed.success) return { kind: "malformed", error: parsed.error };
  return parsed.data.parent === null ? undefined : { kind: "nested", parent: parsed.data.parent };
}

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
