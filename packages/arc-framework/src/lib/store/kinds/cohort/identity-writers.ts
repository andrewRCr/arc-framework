/** Exact cohort identity-field edits over authored coordination prose. */

/** Rewrite the cohort's own heading, preserving all other bytes. */
export function rewriteCohortHeading(content: string, slug: string): string {
  return content.replace(/^# Cohort:[^\r\n]*/mu, `# Cohort: \`${slug}\``);
}

/** Rewrite an existing Parent field, or return null for a top-level document. */
export function writeCohortParent(content: string, parent: string): string | null {
  const field = /^\*\*Parent:\*\*[^\r\n]*/mu;
  return field.test(content) ? content.replace(field, `**Parent:** \`${parent}\``) : null;
}
