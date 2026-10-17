/** Stored-key admission and owner-form checks for ref records. */

import { RecordReferenceSchema, sameReference, type RecordReference } from "../identity.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import { isSlugSafe } from "../../kernel/schema/slug.js";
import { IDENTITY_STATUS_FILENAME } from "../../user-surfaces.js";
import type { RefBackendContext } from "./context.js";
import type { StoreRefusal } from "../refusal.js";
import { decodeStoredReference } from "./path-decode.js";

type KeyContext = Pick<RefBackendContext, "registry">;

/** A captured or proposed record path; undecodable stored entries still reserve their tree names. */
export interface RefPathNeighbor { home: Pick<StoredRecordHome, "ref" | "path">; reference?: RecordReference }

/** Refuse a path that would require one tree entry to be both a file and a folder or another record. */
export function checkRefPathCollision(reference: RecordReference, home: RefPathNeighbor["home"], neighbors: readonly RefPathNeighbor[]): StoreRefusal | undefined {
  for (const neighbor of neighbors) {
    if (neighbor.home.ref !== home.ref) continue;
    const other = neighbor.home.path;
    if (other === home.path && neighbor.reference && sameReference(reference, neighbor.reference)) continue;
    if (other === home.path || other.startsWith(`${home.path}/`) || home.path.startsWith(`${other}/`)) {
      const record = neighbor.reference ? `${neighbor.reference.kind} ${JSON.stringify(neighbor.reference.key)}` : "stored entry";
      return unsupportedKey(reference, `The path ${home.path} collides with ${record} at ${other}`);
    }
  }
  return undefined;
}

/** Check proposed puts together; unresolved owner names remain separate until canonical resolution. */
export function checkRefBatchPaths(references: readonly RecordReference[], registry: RefBackendContext["registry"]): StoreRefusal | undefined {
  const records = references.map((reference) => {
    const home = refKeyHome(reference, registry);
    const owner = reference.owner;
    const unresolved = (owner.type === "work-item" || owner.type === "cohort") && owner.uid === undefined;
    return { reference, home: { ...home, ref: unresolved ? `${home.ref}:${owner.type}:${owner.name}` : home.ref } };
  });
  for (const record of records) {
    const refusal = checkRefPathCollision(record.reference, record.home, records);
    if (refusal) return refusal;
  }
  return undefined;
}

/** Admit a caller's key without resolving an owner or consulting storage. */
export function checkRefKey(reference: RecordReference, registry: RefBackendContext["registry"]): StoreRefusal | undefined {
  const malformed = malformedKeyProblem(reference, registry);
  if (malformed) return { code: "record-malformed", class: "recoverable", reference, rule: "store.key", condition: malformed,
    remedy: { text: "Choose a stored key without control characters or excluded machine-local or derived paths, using one segment for an ID or activity, then retry." } };
  if (!registry[reference.kind].ref) return unsupportedKey(reference, `No ref home is declared for ${reference.kind}`);
  const resolved = pathPrototype(reference);
  const home = expandStoredPath(resolved, { registry });
  const problem = storedKeyProblem({ registry }, resolved, home.path);
  return problem ? unsupportedKey(reference, problem) : undefined;
}

/** Expand key syntax before owner resolution without minting an identity or reading storage. */
export function refKeyHome(reference: RecordReference, registry: RefBackendContext["registry"]): StoredRecordHome {
  return expandStoredPath(pathPrototype(reference), { registry });
}

function pathPrototype(reference: RecordReference): RecordReference {
  const owner = reference.owner;
  return owner.type !== "person" && owner.uid === undefined
    ? RecordReferenceSchema.parse({ ...reference, owner: { ...owner, uid: "00000000-0000-4000-8000-000000000000" } }) : reference;
}

function unsupportedKey(reference: RecordReference, condition: string): StoreRefusal {
  return { code: "unsupported", class: "terminal", case: "unhomed-kind", condition: `${reference.kind}: ${condition}`,
    remedy: { text: "Choose a key outside the named record or reserved path, then retry." } };
}

/** Explain a decoded key that cannot be written back at the captured tree path. */
export function storedKeyProblem(context: KeyContext, reference: RecordReference, path: string): string | null {
  const malformed = malformedKeyProblem(reference, context.registry);
  if (malformed) return malformed;
  const key = reference.key;
  const home = expandStoredPath(reference, { registry: context.registry });
  if (home.path !== path) return "The decoded key does not encode this stored path";
  if (reference.kind === "work-item/companion" && typeof key === "string") {
    const problem = companionProblem(context, key, path, home);
    if (problem) return problem;
  }
  if (reference.kind === "personal/document" && typeof key === "string") {
    const problem = personalProblem(reference.owner.name, key, home);
    if (problem) return problem;
  }
  return reference.kind === "work-item/companion" || reference.kind === "personal/document" ? aliasProblem(context, reference, path) : null;
}

function aliasProblem(context: KeyContext, reference: RecordReference, path: string): string | null {
  const decoded = decodeStoredReference(context.registry, reference.owner, context.registry[reference.kind].family, path,
    { formatVersion: 1, formats: {}, slug: reference.owner.name });
  if (!decoded) return "The stored path does not decode as a record";
  if (!("owner" in decoded)) return decoded.condition;
  return sameReference(reference, decoded) ? null : `The path decodes as ${decoded.kind} with key ${JSON.stringify(decoded.key)}`;
}

function companionProblem(context: KeyContext, key: string, path: string, home: StoredRecordHome): string | null {
  const reservedNames = Object.values(context.registry).flatMap((candidate) => {
    const prefix = candidate.id !== "work-item/companion" ? /^([a-z0-9-]+)-<slug>\.md$/u.exec(candidate.ref?.path ?? "")?.[1] : null;
    return prefix ? [{ prefix, kind: candidate.id }] : [];
  });
  const reserved = isSlugSafe(key) && reservedNames.find((candidate) => candidate.prefix === key);
  if (reserved) return `The companion key names ${reserved.kind}`;
  return reservedPath(path, ["review", "conflicts", "receipts", home.manifestPath.slice(0, -1)], home.metadataPath)
    ? `The companion path belongs to reserved storage at ${path}` : null;
}

function personalProblem(person: string, key: string, home: StoredRecordHome): string | null {
  const prefix = `${person}/`;
  return reservedPath(key, ["conflicts", "receipts", home.manifestPath.slice(prefix.length, -1)], home.metadataPath.slice(prefix.length))
    ? `The personal key belongs to reserved storage at ${key}` : null;
}

function malformedKeyProblem(reference: RecordReference, registry: RefBackendContext["registry"]): string | null {
  const key = reference.key;
  const value = typeof key === "object" ? key.activity : key;
  const shape = registry[reference.kind].key;
  if (value && (hasControl(value) || (shape === "id" || shape === "pass") && value.includes("/"))) {
    return "The key holds a control character or more than one path segment for an ID or activity";
  }
  if (reference.kind === "personal/document" && typeof key === "string"
    && (key === IDENTITY_STATUS_FILENAME || key.split("/").slice(0, 2).includes(".internal"))) {
    return "The personal key names derived or machine-local state";
  }
  return null;
}

function reservedPath(path: string, roots: readonly string[], metadata: string): boolean {
  return path === metadata || roots.some((root) => path === root || path.startsWith(`${root}/`));
}

function hasControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const point = value.charCodeAt(index);
    if (point < 32 || point >= 127 && point <= 159) return true;
  }
  return false;
}
