/** Decode captured state tree entries using registered record homes. */

import { FAMILY_REGISTRY } from "../registry.js";
import { OwnerIdentitySchema, type OwnerIdentity, type RecordReference } from "../identity.js";
import { StoreRecordSchema, type StoreRecord, type ListingDiagnostic } from "../read.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { FamilyId } from "../catalog.js";
import type { RefBackendContext } from "./context.js";
import type { BatchObject } from "./batch-read.js";
import { storedKeyProblem } from "./path-admission.js";
import type { RefMetadata } from "./metadata.js";
import { readRefContent, recordDiagnostic, parsedOwnerProblem } from "./content-read.js";
import { decodeStoredReference, rootFamily } from "./path-decode.js";
export { rootFamily, lineageOwner } from "./path-decode.js";
import { refRecordVersion } from "./record-version.js";

/** Match a captured live ref against the registry, never another ref under the prefix. */
export function matchesFamilyRef(ref: string, family: FamilyId): boolean {
  const placement = FAMILY_REGISTRY[rootFamily(family)].ref;
  if (!placement || !("pattern" in placement)) return false;
  const expression = escapeRegex(placement.pattern).replace("<uid>", "[0-9a-f-]{36}").replace("<id>", "[a-z0-9]+(?:-[a-z0-9]+)*");
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
export function decodeReference(context: RefBackendContext, owner: OwnerIdentity, family: FamilyId, path: string,
  metadata: RefMetadata, object?: BatchObject | null): RecordReference | ListingDiagnostic | null {
  const decoded = decodeStoredReference(context.registry, owner, family, path, metadata, object);
  return decoded && "owner" in decoded && storedKeyProblem(context, decoded, path) ? null : decoded;
}

/** Turn a captured blob and owner metadata into the contract's logical record. */
export function decodeRecord(context: RefBackendContext, reference: RecordReference, object: BatchObject, metadata: RefMetadata,
  path: string, conflicts: RecordReference[] = []): StoreRecord | ListingDiagnostic {
  const kind = context.registry[reference.kind];
  const primary = reference.kind === metadata.primary?.role || reference.kind === "cohort/document";
  const formatVersion = metadata.formats[canonicalize({ kind: reference.kind, ...(reference.key === undefined ? {} : { key: reference.key }) })] ?? 1;
  if (formatVersion > kind.formatVersion) return recordDiagnostic(path, { kind: "unknown-format-version",
    condition: "Stored format version is newer than this build supports." });
  const decoded = readRefContent(kind, object.bytes);
  if ("condition" in decoded) return recordDiagnostic(path, decoded);
  const mismatch = parsedOwnerProblem(reference, decoded.fields);
  if (mismatch) return recordDiagnostic(path, mismatch);
  const placement = metadata.primary?.placement ?? metadata.placement;
  const record = StoreRecordSchema.safeParse({ reference, ...decoded, formatVersion, conflicts,
    version: refRecordVersion(reference, object.oid, metadata, formatVersion),
    ...(placement ? { placement } : {}), ...(primary && metadata.primary?.links ? { links: metadata.primary.links } : {}),
  });
  return record.success ? record.data : recordDiagnostic(path, { kind: "malformed", condition: record.error.message });
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
