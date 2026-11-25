/** Canonical logical companion keys and their owner-relative physical filenames. */
import { isSlugSafe, validateManagedPath } from "../kernel/index.js";

/** Validate a path key, allowing a literal-root discriminator only where name expansion would be ambiguous. */
export function validateCompanionKey(key: string): void {
  if (!key.startsWith("./")) { validateManagedPath(key); return; }
  const literal = key.slice(2);
  if (!isSlugSafe(literal)) throw new Error("A literal-root companion key requires one slug-safe basename after ./");
  validateManagedPath(literal);
}

/** Project a conventional name, including either half of a paired spec, to its artifact basename. */
export function companionArtifactName(slug: string, key: string): string {
  return key === "spec-prd" ? `spec-${slug}-prd.md`
    : key === "spec-rfc" ? `spec-${slug}-rfc.md` : `${key}-${slug}.md`;
}

/** Decode the logical literal prefix before physical path admission; conventional keys follow the owner's name. */
export function companionStoredName(slug: string, key: string): string {
  validateCompanionKey(key);
  return key.startsWith("./") ? key.slice(2) : isSlugSafe(key) ? companionArtifactName(slug, key) : key;
}

/** Invert the physical filename after the caller has handled fixed roles and reserved namespaces. */
export function companionKeyForFile(slug: string, path: string): string {
  if (path === `spec-${slug}-prd.md`) return "spec-prd";
  if (path === `spec-${slug}-rfc.md`) return "spec-rfc";
  const suffix = `-${slug}.md`, name = path.endsWith(suffix) ? path.slice(0, -suffix.length) : "";
  return isSlugSafe(name) ? name : isSlugSafe(path) ? `./${path}` : path;
}
