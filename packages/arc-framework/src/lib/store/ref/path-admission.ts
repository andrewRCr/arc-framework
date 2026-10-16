/** Stored-key admission and owner-form checks for ref records. */

import type { OwnerIdentity, RecordReference } from "../identity.js";
import type { ListingDiagnostic } from "../read.js";
import type { KindDefinition } from "../registry.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import { isSlugSafe } from "../../kernel/schema/slug.js";
import { IDENTITY_STATUS_FILENAME } from "../../user-surfaces.js";
import type { RefBackendContext } from "./context.js";

/** Explain a decoded key that cannot be written back at the captured tree path. */
export function storedKeyProblem(context: RefBackendContext, reference: RecordReference, path: string): string | null {
  const kind = context.registry[reference.kind];
  const key = reference.key;
  const value = typeof key === "object" ? key.activity : key;
  if (value && (hasControl(value) || (kind.key === "id" || kind.key === "pass") && value.includes("/"))) {
    return "The decoded key holds a control character or more than one path segment";
  }
  const home = expandStoredPath(reference, { registry: context.registry });
  if (home.path !== path) return "The decoded key does not encode this stored path";
  if (reference.kind === "work-item/companion" && typeof key === "string") {
    return companionProblem(context, key, path, home);
  }
  if (reference.kind === "personal/document" && typeof key === "string") {
    return personalProblem(reference.owner.name, key, home);
  }
  return null;
}

function companionProblem(context: RefBackendContext, key: string, path: string, home: StoredRecordHome): string | null {
  const reservedNames = Object.values(context.registry).flatMap((candidate) => {
    const prefix = candidate.id !== "work-item/companion" ? /^([a-z0-9-]+)-<slug>\.md$/u.exec(candidate.ref?.path ?? "")?.[1] : null;
    return prefix ? [prefix] : [];
  });
  if (isSlugSafe(key) && reservedNames.includes(key)) return "The companion key names a registered role";
  return reservedPath(path, ["review", "conflicts", "receipts", home.manifestPath.slice(0, -1)], home.metadataPath)
    ? "The companion path belongs to a reserved subtree" : null;
}

function personalProblem(person: string, key: string, home: StoredRecordHome): string | null {
  const prefix = `${person}/`;
  if (key === IDENTITY_STATUS_FILENAME || key.split("/").slice(0, 2).includes(".internal")) return "The personal key names derived or machine-local state";
  return reservedPath(key, ["conflicts", "receipts", home.manifestPath.slice(prefix.length, -1)], home.metadataPath.slice(prefix.length))
    ? "The personal key belongs to a reserved subtree" : null;
}

/** Detect a registered fixed form naming a different owner before a generic path can claim it. */
export function pathOwnerMismatch(kinds: readonly KindDefinition[], owner: OwnerIdentity, path: string): ListingDiagnostic | null {
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
    if (mismatch) return { kind: "key-mismatch", key: path, condition: "The stored path names an owner other than its ref's metadata",
      remedy: { text: "Repair the path or its owner metadata so they name one owner, then list again." } };
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

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
