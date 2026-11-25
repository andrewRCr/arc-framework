/** Unavailable segment evidence cannot silently release a cohort holding. */
import { expect, it } from "vitest";
import { checkCohortOpenMembers, checkCohortArchiveCloseout } from "../../../../../../src/lib/store/kinds/cohort/rules.js";
import { cohortDoc, cohortMember, cohortRuleInput } from "../../../../../helpers/store/cohort-rule-input.js";

it.each(["retirement", "archive closeout"])("refuses %s on an unavailable segment and admits after repair", async rule => {
  const target = cohortDoc(), member = cohortMember("other");
  const proposal = cohortRuleInput(rule === "retirement" ? null : target, target, [member], [member]);
  const before = proposal.before, after = proposal.after;
  const unreadable = async (input: Parameters<typeof before.read>[0]) => input.reference.owner.name === "other"
    ? { status: "refused" as const, refusal: { code: "namespace-corrupt" as const, class: "terminal" as const,
      namespace: "cohort", condition: "The segment is unreadable.", remedy: { text: "Repair the segment, then retry." } } }
    : before.read(input);
  proposal.before = { ...before, read: unreadable };
  proposal.after = { ...after, read: unreadable };
  proposal.writer = { kind: "verb", verb: "archive" };
  const check = rule === "retirement" ? checkCohortOpenMembers : checkCohortArchiveCloseout;
  expect(await check(proposal)).toMatchObject([{ rule: rule === "retirement" ? "cohort.open-members" : "cohort.archive-closeout",
    condition: "The segment is unreadable." }]);
  proposal.before = before;
  proposal.after = after;
  expect(await check(proposal)).toEqual([]);
});
