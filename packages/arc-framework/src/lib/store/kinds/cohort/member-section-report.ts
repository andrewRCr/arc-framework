/** Advisory orphan member-section reporting over cohort coordination prose. */

/** Report member-section slugs that name no supplied member.
 * @param content - Whole cohort document.
 * @param members - Live and staged member identities supplied by the caller.
 * @returns Orphan section slugs in document order, including repeated sections.
 */
export function reportOrphanCohortMemberSections(content: string, members: Iterable<string>): string[] {
  const known = new Set(members);
  return memberSlugs(content).filter((slug) => !known.has(slug));
}

/**
 * The per-member section slugs declared under a cohort doc's `## Members`
 * section — each `### \`<slug>\`` heading. Headings outside `## Members` (the
 * coordination subsections) are ignored.
 */
function memberSlugs(content: string): string[] {
  const slugs: string[] = [];
  let inMembers = false;
  for (const line of content.split(/\r?\n/)) {
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      inMembers = (h2[1] ?? "").trim().toLowerCase() === "members";
      continue;
    }
    if (!inMembers) continue;
    const h3 = /^###\s+`([^`]+)`\s*$/.exec(line);
    if (h3) slugs.push((h3[1] ?? "").trim());
  }
  return slugs;
}

