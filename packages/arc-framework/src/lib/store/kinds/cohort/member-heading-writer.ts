/** Exact member-heading rename over the cohort's coordination prose. */

/** Rewrite an exact member heading only inside the Members section.
 * @param content - Whole cohort document.
 * @param sourceSlug - Member whose heading is being renamed.
 * @param targetSlug - New member identity.
 * @returns Content preserving every line outside exact matching member headings.
 */
export function rewriteCohortMemberHeading(content: string, sourceSlug: string, targetSlug: string): string {
  let inMembers = false;
  return content.split("\n").map((line) => {
    const h2 = /^##\s+(.*)$/u.exec(line);
    if (h2 !== null) {
      inMembers = (h2[1] ?? "").trim().toLowerCase() === "members";
      return line;
    }
    return inMembers && line === `### \`${sourceSlug}\`` ? `### \`${targetSlug}\`` : line;
  }).join("\n");
}
