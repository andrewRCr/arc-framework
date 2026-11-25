/** Shared origin bases admitted by raw and projected partial-Errand markers. */
import { RecordVersionSchema } from "../store/identity.js";
import { LocusDigestSchema, LocusOpaqueTextSchema } from "./schema/limits.js";

/** A partial marker has no origin or exactly one source basis for its entry. */
export type PartialErrandOriginBinding =
  | { readonly originEntry?: never; readonly originEntrySourceDigest?: never; readonly originEntryVersion?: never }
  | { readonly originEntry: string; readonly originEntrySourceDigest: string; readonly originEntryVersion?: never }
  | { readonly originEntry: string; readonly originEntryVersion: string; readonly originEntrySourceDigest?: never };

/** Check an optional origin, admitting bindings only for an identity-free partial Errand. */
export function isValidOriginBinding(value: {
  originEntry?: unknown; originEntrySourceDigest?: unknown; originEntryVersion?: unknown;
}, partial: boolean): boolean {
  const { originEntry, originEntrySourceDigest: digest, originEntryVersion: version } = value;
  if (originEntry === undefined) return digest === undefined && version === undefined;
  if (!partial || !LocusOpaqueTextSchema.safeParse(originEntry).success) return false;
  return digest !== undefined ? version === undefined && LocusDigestSchema.safeParse(digest).success
    : RecordVersionSchema.safeParse(version).success;
}
