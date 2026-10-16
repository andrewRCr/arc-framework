/** Conventional filenames for a work item's logical companion names. */

/** Project a name key, including either half of a paired spec, to its artifact basename. */
export function companionArtifactName(slug: string, key: string): string {
  return key === "spec-prd" ? `spec-${slug}-prd.md`
    : key === "spec-rfc" ? `spec-${slug}-rfc.md` : `${key}-${slug}.md`;
}
