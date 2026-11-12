/** Exact legacy or store origin passed through Errand transition schemas. */
import { CanonicalDigestSchema, type CanonicalDigest } from "../kernel/index.js";
/** Store origins use qualified IDs with a null digest; partial starts additionally bind the observed version. */
export interface ErrandInboxOrigin { title: string; sourceDigest: CanonicalDigest | null; executeBound: boolean; version?: string }
/** Re-feed a persisted origin without changing either its ID/title or nullable digest.
 * @param entry - Persisted origin operand, null for description-origin Errands.
 * @param digest - Persisted legacy source digest or null for a qualified ID.
 * @returns Runtime adoption operand preserving the original pair.
 */
export function restoreErrandInboxOrigin(entry: string | null, digest: string | null): ErrandInboxOrigin | null {
  return entry === null ? null : { title: entry, sourceDigest: digest === null ? null : CanonicalDigestSchema.parse(digest), executeBound: false };
}
