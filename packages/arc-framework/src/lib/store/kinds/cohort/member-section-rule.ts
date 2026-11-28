/** A hand edit names under a cohort record's members heading only the current names of that cohort's members. */
import { brokenRule } from "../rule-support.js";
import { observeDirectMemberNames } from "./check-support.js";
import { cohortMemberSectionSlugs } from "./member-section-report.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";

const RULE = "cohort.member-sections";

/**
 * Refuse a hand edit whose resulting record keeps a member section that names no current member.
 *
 * A member is a work unit, live or completed, whose `Cohort` field's last segment names this cohort by its current
 * name or a former one. A subcohort, a subcohort's member, and a member's former name are not members. A verb's write
 * never refuses here, so a section a verb leaves refuses the record's next hand edit instead.
 *
 * @param input - Proposed cohort write.
 * @returns The section slugs no member's current name matches, or nothing.
 */
export async function checkCohortMemberSections(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  if (input.writer.kind === "verb" || input.next === undefined) return [];
  const names = new Set(cohortMemberSectionSlugs(input.next.content));
  if (names.size === 0) return [];
  const members = await observeDirectMemberNames(input.after, input.reference, names);
  if (members.status === "unresolved") return [{ rule: RULE, condition: members.condition, remedy: members.remedy }];
  if (members.status !== "known") {
    return [brokenRule(RULE, members.status === "unavailable" ? members.condition : "Cohort membership evidence is unavailable.",
      "Repair the reported membership evidence, then retry.")];
  }
  const orphans = [...names].filter(name => !members.value.has(name));
  return orphans.length === 0 ? [] : [brokenRule(RULE,
    `The cohort record's Members sections name no current member of this cohort: ${orphans.map(slug => `\`${slug}\``).join(", ")}.`,
    "Remove or rename each such section, or save that member's meta naming this cohort first, then retry.")];
}
