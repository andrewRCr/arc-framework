/** Content-addressed record versions scoped to each record's own metadata. */

import { canonicalDigest } from "../../kernel/canonical/canonical-json.js";
import { RecordVersionSchema, type RecordReference, type RecordVersion } from "../identity.js";
import type { RefMetadata } from "./metadata.js";

/** Digest blob identity and only the metadata that belongs to this logical record. */
export function refRecordVersion(reference: RecordReference, blob: string, metadata: RefMetadata, formatVersion: number): RecordVersion {
  const primary = reference.kind === metadata.primary?.role || reference.kind === "cohort/document";
  const ownMetadata = primary ? { role: reference.kind, slug: metadata.slug ?? reference.owner.name,
    formerSlugs: metadata.formerSlugs ?? [], placement: metadata.primary?.placement ?? metadata.placement ?? null,
    links: metadata.primary?.links ?? null, formatVersion } : { formatVersion };
  return RecordVersionSchema.parse(canonicalDigest({ blob, metadata: ownMetadata }));
}
