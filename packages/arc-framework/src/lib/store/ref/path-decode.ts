/** Pure stored-path classification before key admission, shared by reads and validation. */
import { FAMILY_REGISTRY, type KindDefinition } from "../registry.js";
import type { KindId, FamilyId } from "../catalog.js";
import { OwnerIdentitySchema, RecordReferenceSchema, type OwnerIdentity, type RecordReference } from "../identity.js";
import type { ListingDiagnostic } from "../read.js";
import { isSlugSafe } from "../../kernel/schema/slug.js";
import type { RefMetadata } from "./metadata.js";
import type { BatchObject } from "./batch-read.js";
import { conflictTarget } from "./conflicts-read.js";

/** Resolve the top-level family that owns a ref, including shared subtrees. */
export function rootFamily(family: FamilyId): FamilyId {
  const placement = FAMILY_REGISTRY[family].ref;
  return placement && "subtreeOf" in placement ? placement.subtreeOf : family;
}

/** Read an origin's canonical name from the registry's UID-keyed lineage map. */
export function lineageOwner(metadata: RefMetadata, uid: string | undefined): OwnerIdentity {
  return OwnerIdentitySchema.parse({ type: "work-item", uid, name: uid ? metadata.lineage?.[uid] : undefined });
}

/** Match an entry's fixed form before considering a work item's generic companion. */
export function decodeStoredReference(registry: Readonly<Record<KindId, KindDefinition>>, owner: OwnerIdentity, family: FamilyId, path: string,
  metadata: RefMetadata, object?: BatchObject | null): RecordReference | ListingDiagnostic | null {
  const kinds = Object.values(registry).filter((kind) => kind.ref && rootFamily(kind.family) === rootFamily(family));
  for (const kind of kinds) {
    if (kind.id === "work-item/companion" || kind.id === "personal/document") continue;
    const candidateOwner = kind.family === "lineage" ? lineageEntryOwner(kind, path, metadata, object) : owner;
    if (!candidateOwner) continue;
    const decoded = decodeKindReference(kind, candidateOwner, path);
    if (decoded) return decoded;
  }
  const companion = rootFamily(family) === "work-item" ? decodeCompanion(owner, path) : null;
  if (companion && typeof companion.key === "string" && isSlugSafe(companion.key)) return companion;
  const mismatch = pathOwnerMismatch(kinds, owner, path);
  if (mismatch) return mismatch;
  if (companion) return companion;
  const document = kinds.find((kind) => kind.id === "personal/document");
  return document ? decodeKindReference(document, owner, path) : null;
}

function decodeKindReference(kind: KindDefinition, owner: OwnerIdentity, path: string): RecordReference | null {
  const key = keyAtPath(kind, owner, path);
  if (key === null) return null;
  const parsed = RecordReferenceSchema.safeParse({ owner, kind: kind.id, ...(kind.key === null ? {} : { key }) });
  return parsed.success ? parsed.data : null;
}

function lineageEntryOwner(kind: KindDefinition, path: string, metadata: RefMetadata,
  object?: BatchObject | null): OwnerIdentity | null {
  const target = kind.id === "lineage/conflict-record" && object ? conflictTarget(object.bytes)?.owner : null;
  const uid = target?.type === "work-item" ? target.uid : /^lineage\/([0-9a-f-]{36})\.json$/u.exec(path)?.[1];
  return uid && metadata.lineage?.[uid] ? lineageOwner(metadata, uid) : null;
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

/** Detect a registered fixed form naming a different owner before a generic path can claim it. */
function pathOwnerMismatch(kinds: readonly KindDefinition[], owner: OwnerIdentity, path: string): ListingDiagnostic | null {
  for (const kind of kinds) {
    if (!kind.ref || kind.owner !== owner.type || kind.id === "work-item/companion") continue;
    const coordinates: string[] = [];
    const pattern = escapeRegex(kind.ref.path).replace(/<(slug|uid|person|key)>/gu, (_token, coordinate: string) => {
      coordinates.push(coordinate);
      return coordinate === "key" ? "(.+)" : coordinate === "uid" ? "([0-9a-f-]{36})" : "([a-z0-9]+(?:-[a-z0-9]+)*)";
    });
    const match = new RegExp(`^${pattern}$`, "u").exec(path);
    if (!match) continue;
    const mismatch = coordinates.some((coordinate, index) => coordinate !== "key" && match[index + 1]
      !== (coordinate === "uid" && owner.type !== "person" ? owner.uid : owner.name));
    if (mismatch) return { kind: "key-mismatch", key: path, condition: `The ${kind.id} stored path names an owner other than its ref's metadata`,
      remedy: { text: "Repair the path or its owner metadata so they name one owner, then list again." } };
  }
  return null;
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
