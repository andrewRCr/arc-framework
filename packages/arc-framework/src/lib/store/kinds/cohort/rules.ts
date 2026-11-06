/** Cohort Purpose, Parent, and retirement integrity over the proposed state. */
import { OwnerIdentitySchema, recordReferences } from "../../identity.js";
import type { Remedy } from "../../refusal.js";
import { brokenRule, observeRecord, observeNamedRecord, type RuleObservation } from "../rule-support.js";
import { changedCohortFields, observeOpenCohorts, observeOpenMembers, observeOpenHoldings, observeAllHoldings, describeCohortHoldings, describeCohortHoldingOwners, type CohortEvidence, type CohortMemberEvidence } from "./check-support.js";
import { parseCohortDocument } from "./parser.js";
import type { BrokenRule, StoreView, WriteCheckInput } from "../../write-check.js";
/** Require an authored Purpose on creation or a proved Purpose change.
 * @param input - Proposed cohort write.
 * @returns Purpose-floor violations.
 */
export function checkCohortPurpose(input: WriteCheckInput): readonly BrokenRule[] {
  const next = changedCohortFields(input, "purpose");
  const purpose = next?.purpose?.trim();
  return next === undefined || (purpose !== undefined && purpose !== "" && purpose !== "—") ? []
    : [brokenRule("cohort.purpose", "The new or changed cohort Purpose is absent, empty, or —.",
      "Author a non-empty Purpose before creating the cohort or changing its Purpose.")];
}
/** Keep new or changed nesting within one level and consistent with every open member.
 * @param input - Proposed cohort write and whole-batch views.
 * @returns Parent-integrity violations.
 */
export async function checkCohortParent(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const next = changedCohortFields(input, "parent");
  if (next === undefined) return [];
  const fail = (condition: string, remedy?: Remedy): readonly BrokenRule[] => [{ rule: "cohort.parent", condition,
    remedy: remedy ?? { text: "Use an open top-level parent, keep nesting to one level, and settle all open member paths in the same batch." } }];
  if (next.parent !== null) {
    const problem = await parentProblem(input.after, next.parent);
    if (problem !== undefined) return fail(problem.condition, problem.remedy);
  }
  const [cohorts, members] = await Promise.all([observeOpenCohorts(input.after), observeOpenMembers(input.after)]);
  if (cohorts.status !== "known") return fail(cohorts.status === "unavailable" ? cohorts.condition : "Open cohort evidence is unavailable.");
  if (members.status !== "known") return fail(members.status === "unavailable" ? members.condition : "Open membership evidence is unavailable.");
  const name = input.reference.owner.name;
  if (next.parent !== null && cohorts.value.some(({ fields }) => fields.parent === name)) {
    return fail("Nesting this cohort would put its own open subcohorts below the one-level limit.");
  }
  const disagreeing = members.value.filter((member) => !memberAgrees(member, name, next.parent, cohorts.value));
  return disagreeing.length === 0 ? [] : fail(`Open member Cohort paths disagree with Parent: ${disagreeing.map(({ record }) => record.reference.owner.name).join(", ")}.`);
}
/** Keep a cohort document until every proposed open member and subcohort has left.
 * @param input - Proposed document removal or placement change.
 * @returns Open-member retention violations.
 */
export async function checkCohortOpenMembers(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const fail = (condition: string): readonly BrokenRule[] => [brokenRule("cohort.open-members", condition,
    "Retain the cohort document or settle its open members and subcohorts in the same batch before retiring it.")];
  const retirement = await observeRetirement(input);
  if (retirement.status !== "known") return fail(retirement.status === "unavailable" ? retirement.condition : "Cohort retirement evidence is unavailable.");
  if (!retirement.value) return [];
  const held = await observeOpenHoldings(input.after, input.before, input.reference);
  if (held.status !== "known") return fail(held.status === "unavailable" ? held.condition : "Open holding evidence is unavailable.");
  return held.value.length === 0 ? [] : fail(describeCohortHoldings(held.value, input.reference.owner.name));
}
/** Keep every holder's document during explicit removal, including completed records. */
export async function checkCohortRemoveHoldings(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.next !== undefined || input.writer.kind !== "verb" || input.writer.verb !== "cohort-remove") return [];
  const held = await observeAllHoldings(input.after, input.reference, input.before);
  const fail = (condition: string): readonly BrokenRule[] => [brokenRule("cohort.remove-holdings", condition,
    "Keep this document until every holder's owner clears or re-points Cohort and Parent, then retry removal.")];
  if (held.status !== "known") return fail(held.status === "unavailable" ? held.condition : "All-record holding evidence is unavailable.");
  return held.value.length === 0 ? [] : fail(describeCohortHoldingOwners(held.value));
}
/** Require local archive closeout in the batch that removes the final open holding.
 * @param input - Cohort write and whole-batch membership views.
 * @returns A stale completion refusal, without banning existing open empty cohorts.
 */
export async function checkCohortArchiveCloseout(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.writer.kind !== "verb" || input.writer.verb !== "archive" || input.prior === undefined || input.next === undefined) return [];
  const fail = (condition: string): readonly BrokenRule[] => [brokenRule("cohort.archive-closeout", condition,
    "Reprepare archive against current membership and complete the final member and eligible cohorts in the same batch, then retry.")];
  const cohort = await observeRecord(input.after, input.reference);
  if (cohort.status !== "known") return fail(cohort.status === "unavailable" ? cohort.condition : "The proposed cohort is unavailable.");
  if (cohort.value.placement?.kind === "completed") return [];
  const name = input.reference.owner.name;
  const [before, after] = await Promise.all([observeOpenHoldings(input.before, input.before, input.reference),
    observeOpenHoldings(input.after, input.after, input.reference)]);
  if (before.status !== "known") return fail(before.status === "unavailable" ? before.condition : "Prior membership evidence is unavailable.");
  if (after.status !== "known") return fail(after.status === "unavailable" ? after.condition : "Proposed membership evidence is unavailable.");
  return before.value.length > 0 && after.value.length === 0
    ? fail(`The archive batch removes the final open member or subcohort of ${name} without completing its document.`) : [];
}
async function parentProblem(view: StoreView, name: string): Promise<{ condition: string; remedy?: Remedy } | undefined> {
  const parent = await observeNamedRecord(view, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })));
  if (parent.status === "ambiguous") return { condition: parent.condition, remedy: parent.remedy };
  if (parent.status !== "known") return { condition: parent.status === "unavailable" ? parent.condition : "The named parent cohort is absent." };
  if (parent.value.reference.owner.name !== name) return { condition: `The parent cohort '${name}' is now named '${parent.value.reference.owner.name}'.` };
  if (parent.value.placement?.kind === "completed") return { condition: "The named parent cohort is completed." };
  const parsed = parseCohortDocument(parent.value.content);
  return !parsed.success ? { condition: parsed.error } : parsed.data.parent !== null
    ? { condition: "The named parent is already nested below another cohort." } : undefined;
}

function memberAgrees(member: CohortMemberEvidence, name: string, parent: string | null, cohorts: readonly CohortEvidence[]): boolean {
  const parts = member.cohort?.split("/") ?? [];
  if (!parts.includes(name)) return true;
  if (parent !== null) return member.cohort === `${parent}/${name}`;
  return parts.length === 1 || (parts.length === 2 && parts[0] === name
    && cohorts.some(({ record, fields }) => record.reference.owner.name === parts[1] && fields.parent === name));
}

async function observeRetirement(input: WriteCheckInput): Promise<RuleObservation<boolean>> {
  if (input.next === undefined) return { status: "known", value: true };
  const after = await observeRecord(input.after, input.reference);
  if (after.status !== "known") return { status: "unavailable", condition: after.status === "unavailable" ? after.condition : "Resulting cohort placement is unavailable." };
  if (after.value.placement?.kind !== "completed") return { status: "known", value: false };
  if (input.prior === undefined) return { status: "known", value: true };
  const before = await observeRecord(input.before, input.reference);
  return before.status === "known" ? { status: "known", value: before.value.placement?.kind !== "completed" }
    : { status: "unavailable", condition: before.status === "unavailable" ? before.condition : "Prior cohort placement is unavailable." };
}
