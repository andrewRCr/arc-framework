/** Decode captured state tree entries using registered record homes. */

import { z } from "zod";
import { FAMILY_REGISTRY, type KindDefinition } from "../registry.js";
import { OwnerIdentitySchema, RecordReferenceSchema, RecordVersionSchema, type OwnerIdentity, type RecordReference } from "../identity.js";
import { StoreRecordSchema, type StoreRecord } from "../read.js";
import { WritePlacementSchema } from "../placement.js";
import { LinksSchema } from "../links.js";
import { canonicalDigest, canonicalize } from "../../kernel/canonical/canonical-json.js";
import { expandStoredPath } from "../stored-path.js";
import { isSlugSafe } from "../../kernel/schema/slug.js";
import type { FamilyId } from "../catalog.js";
import type { RefBackendContext } from "./context.js";
import type { BatchObject } from "./batch-read.js";

/** Metadata accompanying the first live-record decode. */
export const RefMetadataSchema = z.object({
  formatVersion: z.literal(1), slug: z.string().optional(), formerSlugs: z.array(z.string()).optional(),
  primary: z.object({ role: z.enum(["work-item/meta", "work-item/record"]), placement: WritePlacementSchema,
    links: LinksSchema.optional() }).optional(),
  placement: WritePlacementSchema.optional(), lineage: z.record(z.string(), z.string()).optional(),
  endBatch: z.string().optional(), batch: z.string().optional(), formats: z.record(z.string(), z.number().int().positive()),
});
/** Decoded ref metadata. */
export type RefMetadata = z.infer<typeof RefMetadataSchema>;

/** Resolve the top-level family that owns a ref, including shared subtrees. */
export function rootFamily(family: FamilyId): FamilyId {
  const placement = FAMILY_REGISTRY[family].ref;
  return placement && "subtreeOf" in placement ? placement.subtreeOf : family;
}

/** Match a captured live ref against the registry, never another ref under the prefix. */
export function matchesFamilyRef(ref: string, family: FamilyId): boolean {
  const placement = FAMILY_REGISTRY[rootFamily(family)].ref;
  if (!placement || !("pattern" in placement)) return false;
  const expression = escapeRegex(placement.pattern).replace("<uid>", "[0-9a-f-]{36}").replace("<id>", "[a-z0-9]+(?:-[a-z0-9]+)*");
  return new RegExp(`^${expression}$`, "u").test(ref);
}

/** Read canonical metadata through the schema used by record decoding. */
export function parseRefMetadata(object: BatchObject | null | undefined): RefMetadata {
  if (object?.type !== "blob") throw new Error("Missing ref metadata");
  return RefMetadataSchema.parse(JSON.parse(canonicalize(JSON.parse(new TextDecoder().decode(object.bytes)))));
}

/** Construct the ref's logical owner once its metadata supplies its current slug. */
export function refOwner(ref: string, family: FamilyId, metadata: RefMetadata): OwnerIdentity {
  const root = rootFamily(family);
  if (root === "personal" || root === "claims") return OwnerIdentitySchema.parse({ type: "person", name: ref.split("/")[3] });
  if (root === "project-inbox" || root === "project-registry") return OwnerIdentitySchema.parse({ type: "project", name: "project" });
  return OwnerIdentitySchema.parse({ type: root, name: metadata.slug, uid: ref.split("/").at(-1) });
}

/** Match an entry's fixed form before considering a work item's generic companion. */
export function decodeReference(context: RefBackendContext, owner: OwnerIdentity, family: FamilyId, path: string): RecordReference | null {
  for (const kind of Object.values(context.registry)) {
    if (!kind.ref || kind.id === "work-item/companion" || rootFamily(kind.family) !== rootFamily(family)) continue;
    const key = keyAtPath(kind, owner, path);
    if (key === null) continue;
    const parsed = RecordReferenceSchema.safeParse({ owner, kind: kind.id, ...(kind.key === null ? {} : { key }) });
    if (parsed.success && expandStoredPath(parsed.data, { registry: context.registry }).path === path) return parsed.data;
  }
  if (rootFamily(family) !== "work-item" || path.startsWith("review/")) return null;
  return decodeCompanion(owner, path);
}

function decodeCompanion(owner: OwnerIdentity, path: string): RecordReference | null {
  const paired = path === `spec-${owner.name}-prd.md` ? "spec-prd" : path === `spec-${owner.name}-rfc.md` ? "spec-rfc" : null;
  const suffix = `-${owner.name}.md`;
  const name = path.endsWith(suffix) ? path.slice(0, -suffix.length) : "";
  const parsed = RecordReferenceSchema.safeParse({ owner, kind: "work-item/companion", key: paired ?? (isSlugSafe(name) ? name : path) });
  return parsed.success ? parsed.data : null;
}

function keyAtPath(kind: KindDefinition, owner: OwnerIdentity, path: string): unknown {
  const uid = owner.type === "person" ? "" : owner.uid ?? "";
  const template = kind.ref?.path.replaceAll("<slug>", owner.name).replaceAll("<person>", owner.name).replaceAll("<uid>", uid);
  if (!template) return null;
  const match = new RegExp(`^${escapeRegex(template).replace("<key>", "(.+)")}$`, "u").exec(path);
  if (!match) return null;
  if (kind.key !== "pass") return match[1] ?? "";
  const pass = /^(.*)-(\d+)$/u.exec(match[1] ?? "");
  return pass ? { activity: pass[1], number: Number(pass[2]) } : null;
}

/** Turn a captured blob and owner metadata into the contract's logical record. */
export function decodeRecord(context: RefBackendContext, reference: RecordReference, object: BatchObject, metadata: RefMetadata,
  conflicts: RecordReference[] = []): StoreRecord {
  const content = new TextDecoder().decode(object.bytes);
  const kind = context.registry[reference.kind];
  const primary = reference.kind === metadata.primary?.role || reference.kind === "cohort/document";
  const formatVersion = metadata.formats[canonicalize({ kind: reference.kind, ...(reference.key === undefined ? {} : { key: reference.key }) })] ?? 1;
  const recordMetadata = primary ? { role: reference.kind, slug: metadata.slug ?? reference.owner.name,
    formerSlugs: metadata.formerSlugs ?? [], placement: metadata.primary?.placement ?? metadata.placement ?? null,
    links: metadata.primary?.links ?? null, formatVersion } : { formatVersion };
  const parsed = kind.parser?.(content);
  if (parsed && !parsed.success) throw new Error(parsed.error);
  const placement = metadata.primary?.placement ?? metadata.placement;
  return StoreRecordSchema.parse({ reference, content, formatVersion, conflicts,
    version: RecordVersionSchema.parse(canonicalDigest({ blob: object.oid, metadata: recordMetadata })),
    ...(parsed?.success ? { fields: parsed.data } : {}),
    ...(placement ? { placement } : {}), ...(primary && metadata.primary?.links ? { links: metadata.primary.links } : {}),
  });
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
