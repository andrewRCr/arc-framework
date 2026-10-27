/** Decode captured state tree entries using registered record homes. */

import type { ReadPlacement } from "../placement.js";
import { FAMILY_REGISTRY } from "../registry.js";
import { OwnerIdentitySchema, STORED_UID_SOURCE, type OwnerIdentity, type RecordReference } from "../identity.js";
import { StoreRecordSchema, type StoreRecord, type ListingDiagnostic } from "../read.js";
import type { FamilyId } from "../catalog.js";
import type { RefBackendContext } from "./context.js";
import type { BatchObject } from "./batch-read.js";
import { storedKeyProblem } from "./path-admission.js";
import type { RefMetadata } from "./metadata.js";
import { readRefContent, recordDiagnostic, parsedOwnerProblem } from "./content-read.js";
import { decodeStoredReference, rootFamily } from "./path-decode.js";
export { rootFamily, lineageOwner } from "./path-decode.js";
import { refRecordVersion } from "./record-version.js";
import { refFormatKey } from "./format-key.js";

/** Match a captured live ref against the registry, never another ref under the prefix. */
export function matchesFamilyRef(ref: string, family: FamilyId): boolean {
  const placement = FAMILY_REGISTRY[rootFamily(family)].ref;
  if (!placement || !("pattern" in placement)) return false;
  return matchesRefPattern(ref, placement.pattern);
}

/** Match only a directory that can contain a registered live ref. */
export function matchesFamilyRefDirectory(ref: string, family: FamilyId): boolean {
  const placement = FAMILY_REGISTRY[rootFamily(family)].ref;
  if (!placement || !("pattern" in placement)) return false;
  const parts = placement.pattern.split("/"), depth = ref.split("/").length;
  return depth < parts.length && matchesRefPattern(ref, parts.slice(0, depth).join("/"));
}

function matchesRefPattern(ref: string, pattern: string): boolean {
  const expression = escapeRegex(pattern).replace("<uid>", STORED_UID_SOURCE).replace("<id>", "[a-z0-9]+(?:-[a-z0-9]+)*");
  return new RegExp(`^${expression}$`, "u").test(ref);
}

/** Construct the ref's logical owner once its metadata supplies its current slug. */
export function refOwner(ref: string, family: FamilyId, metadata: RefMetadata): OwnerIdentity {
  const root = rootFamily(family);
  if (root === "personal" || root === "claims") return OwnerIdentitySchema.parse({ type: "person", name: ref.split("/")[3] });
  if (root === "project-inbox" || root === "project-registry") return OwnerIdentitySchema.parse({ type: "project", name: "project" });
  return OwnerIdentitySchema.parse({ type: root, name: metadata.slug, uid: ref.split("/").at(-1) });
}

/** Decode an admitted stored reference, preserving exact-path owner diagnostics. */
export function decodeReference(context: Pick<RefBackendContext, "registry">, owner: OwnerIdentity, family: FamilyId, path: string,
  metadata: RefMetadata, object?: BatchObject | null): RecordReference | ListingDiagnostic | null {
  const decoded = decodeStoredReference(context.registry, owner, family, path, metadata, object);
  return decoded && "owner" in decoded && storedKeyProblem(context, decoded, path) ? null : decoded;
}

/** Caller-owned decoding semantics for point reads and immutable saved state. */
export interface RefRecordDecodeOptions { pointRead?: boolean; saved?: boolean }

/** Turn a captured blob and owner metadata into the contract's logical record. */
export function decodeRecord(context: RefBackendContext, reference: RecordReference, object: BatchObject, metadata: RefMetadata,
  path: string, conflicts: RecordReference[] = [], placementOverride?: ReadPlacement, options: RefRecordDecodeOptions = {}): StoreRecord | ListingDiagnostic {
  const kind = context.registry[reference.kind];
  const primary = reference.kind === metadata.primary?.role || reference.kind === "cohort/document";
  const formatVersion = metadata.formats[refFormatKey(reference)] ?? 1;
  if (formatVersion > kind.formatVersion) return recordDiagnostic(path, { kind: "unknown-format-version",
    condition: "Stored format version is newer than this build supports." }, options.saved);
  const decoded = readRefContent(kind, object.bytes, options.pointRead);
  if ("condition" in decoded) return recordDiagnostic(path, decoded, options.saved);
  const formerNames = reference.owner.type === "work-item" && reference.owner.uid
    ? metadata.lineageFormerSlugs?.[reference.owner.uid] ?? [] : [];
  const mismatch = parsedOwnerProblem(reference, decoded.fields, formerNames);
  if (mismatch) return recordDiagnostic(path, mismatch, options.saved);
  const placement = placementOverride ?? metadata.primary?.placement ?? metadata.placement;
  const record = StoreRecordSchema.safeParse({ reference, ...decoded, formatVersion, conflicts,
    version: refRecordVersion(reference, object.oid, metadata, formatVersion),
    ...(placement ? { placement } : {}), ...(primary && metadata.primary?.links ? { links: metadata.primary.links } : {}),
    ...(primary && reference.owner.type === "work-item" ? { aliases: metadata.formerSlugs ?? [] } : {}),
  });
  return record.success ? record.data : recordDiagnostic(path, { kind: "malformed", condition: record.error.message }, options.saved);
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
