/** Member headings and advisory orphan reporting over cohort coordination prose. */
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
  return cohortMemberSectionHeadings(content).map(({ slug }) => slug);
}

/** Locate member headings in document order and return the source range of each name's code span. */
export function cohortMemberSectionHeadings(content: string): { slug: string; start: number; end: number }[] {
  const headings: { slug: string; start: number; end: number }[] = [];
  const bom = content.startsWith("\uFEFF") ? 1 : 0;
  let inMembers = false;
  for (const node of fromMarkdown(content).children) {
    if (node.type !== "heading") continue;
    const [label, ...rest] = node.children;
    if (node.depth === 2) {
      inMembers = rest.length === 0 && label?.type === "text" && label.value.trim().toLowerCase() === "members";
    } else if (inMembers && node.depth === 3 && rest.length === 0 && label?.type === "inlineCode") {
      const start = label.position?.start.offset, end = label.position?.end.offset;
      if (start !== undefined && end !== undefined) headings.push({ slug: label.value.trim(), start: start + bom, end: end + bom });
    }
  }
  return headings;
}

