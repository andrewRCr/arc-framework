/** Conventional filenames for a work item's logical companion names. */
import { isSlugSafe } from "../kernel/schema/slug.js";

/** Project a name key, including either half of a paired spec, to its artifact basename. */
export function companionArtifactName(slug: string, key: string): string {
  return key === "spec-prd" ? `spec-${slug}-prd.md`
    : key === "spec-rfc" ? `spec-${slug}-rfc.md` : `${key}-${slug}.md`;
}

/** Name a companion beside its meta: a slug-safe key by its conventional basename, any other key as written. */
export function companionStoredName(slug: string, key: string): string {
  return isSlugSafe(key) ? companionArtifactName(slug, key) : key;
}
