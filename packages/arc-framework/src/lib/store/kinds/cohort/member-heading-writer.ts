/** Exact member-heading rename over the cohort's coordination prose. */
import { cohortMemberSectionHeadings } from "./member-section-report.js";

/** Rewrite an exact member heading only inside the Members section.
 * @param content - Whole cohort document.
 * @param sourceSlug - Member whose heading is being renamed.
 * @param targetSlug - New member identity.
 * @returns Content preserving every byte outside the matched slugs.
 */
export function rewriteCohortMemberHeading(content: string, sourceSlug: string, targetSlug: string): string {
  return cohortMemberSectionHeadings(content).reduceRight((rewritten, { slug, start, end }) => {
    if (slug !== sourceSlug) return rewritten;
    const label = rewritten.slice(start, end).replace(sourceSlug, () => targetSlug);
    return rewritten.slice(0, start) + label + rewritten.slice(end);
  }, content);
}
