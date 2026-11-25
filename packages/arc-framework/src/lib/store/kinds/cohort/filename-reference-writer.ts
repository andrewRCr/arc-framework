/** Exact backticked references to cohort document filenames. */

/** Rewrite only the named cohort document's backticked filename. */
export function rewriteCohortFilenameReferences(content: string, source: string, target: string): string {
  return content.replaceAll("`cohort-" + source + ".md`", "`cohort-" + target + ".md`");
}
