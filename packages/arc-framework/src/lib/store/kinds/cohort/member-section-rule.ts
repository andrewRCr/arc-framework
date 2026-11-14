/** A hand edit names under a cohort record's members heading only the current names of that cohort's members. */
import { brokenRule } from "../rule-support.js";
import { observeAllMemberHoldings } from "./check-support.js";
import { cohortMemberSectionSlugs, reportOrphanCohortMemberSections } from "./member-section-report.js";
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
  if (cohortMemberSectionSlugs(input.next.content).length === 0) return [];
  const held = await observeAllMemberHoldings(input.after, input.reference);
  if (held.status !== "known") {
    return [brokenRule(RULE, held.status === "unavailable" ? held.condition : "Cohort membership evidence is unavailable.",
      "Repair the reported membership evidence, then retry.")];
  }
  const members = held.value.filter(holding => holding.segment === holding.segments.length - 1)
    .map(holding => holding.candidate.reference.owner.name);
  const orphans = [...new Set(reportOrphanCohortMemberSections(input.next.content, members))];
  return orphans.length === 0 ? [] : [brokenRule(RULE,
    `The cohort record's Members sections name no current member of this cohort: ${orphans.map(slug => `\`${slug}\``).join(", ")}.`,
    "Remove or rename each such section, or save that member's meta naming this cohort first, then retry.")];
}
