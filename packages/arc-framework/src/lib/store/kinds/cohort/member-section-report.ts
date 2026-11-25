/** Advisory orphan member-section reporting over cohort coordination prose. */
import { fromMarkdown } from "mdast-util-from-markdown";

/** Report member-section slugs that name no supplied member.
 * @param content - Whole cohort document.
 * @param members - Live and staged member identities supplied by the caller.
 * @returns Orphan section slugs in document order, including repeated sections.
 */
export function reportOrphanCohortMemberSections(content: string, members: Iterable<string>): string[] {
  const known = new Set(members);
  return cohortMemberSectionSlugs(content).filter((slug) => !known.has(slug));
}

/**
 * The per-member section slugs declared under a cohort doc's `## Members`
 * section — each `### \`<slug>\`` heading. Headings outside `## Members` (the
 * coordination subsections) are ignored.
 *
 * @param content - Whole cohort document.
 * @returns Section slugs in document order, including repeated sections.
 */
export function cohortMemberSectionSlugs(content: string): string[] {
  const slugs: string[] = [];
  let inMembers = false;
  for (const node of fromMarkdown(content).children) {
    if (node.type !== "heading") continue;
    const [label, ...rest] = node.children;
    if (node.depth === 2) {
      inMembers = rest.length === 0 && label?.type === "text" && label.value.trim().toLowerCase() === "members";
    } else if (inMembers && node.depth === 3 && rest.length === 0 && label?.type === "inlineCode") {
      slugs.push(label.value.trim());
    }
  }
  return slugs;
}

