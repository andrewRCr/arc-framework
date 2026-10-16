/** Pure Git tree-name admission, including the aliases checked by Git's object validator. */
import { RecordReferenceSchema, type RecordReference } from "./identity.js";
import { KIND_REGISTRY } from "./registry.js";
import { expandStoredPath } from "./stored-path.js";
import { isSlugSafe } from "../kernel/schema/slug.js";

const specialNames = [".git", ".gitmodules", ".gitattributes"];
const hfsIgnored = /[\u200c-\u200f\u202a-\u202e\u206a-\u206f\ufeff]/gu;

function hashedAlias(name: string, prefix: string): boolean {
  const tilde = name.indexOf("~");
  return name.length === 8 && tilde >= 0 && tilde <= 6
    && name.slice(0, tilde) === prefix.slice(0, tilde) && /^[1-9][0-9]*$/u.test(name.slice(tilde + 1));
}

function gitSpecialSegment(segment: string): boolean {
  // HFS and NTFS are independent predicates: their normalizations must not compose.
  if (specialNames.includes(segment.replace(hfsIgnored, "").toLowerCase())) return true;
  const ntfs = segment.split(":", 1)[0]?.replace(/[. ]+$/u, "").toLowerCase() ?? "";
  return specialNames.includes(ntfs) || ntfs === "git~1" || /^(?:gitmod|gitatt)~[1-4]$/u.test(ntfs)
    || hashedAlias(ntfs, "gi7eba") || hashedAlias(ntfs, "gi7d29");
}

/** Check names before resolving identity; a fixed UID expands syntax without allocating a generation. */
export function hasUnsafeStoredPath(reference: RecordReference): boolean {
  const key = typeof reference.key === "object" ? reference.key.activity : reference.key;
  const verbatim = reference.kind === "personal/document"
    || reference.kind === "work-item/companion" && typeof key === "string" && !isSlugSafe(key);
  if (Buffer.byteLength(reference.owner.name) > 2_040
    || (!verbatim && key !== undefined && Buffer.byteLength(key) > 2_040)) return true;
  if (!KIND_REGISTRY[reference.kind].ref) return false;
  const owner = reference.owner;
  const resolved = owner.type !== "person" && owner.uid === undefined
    ? RecordReferenceSchema.parse({ ...reference, owner: { ...owner, uid: "00000000-0000-4000-8000-000000000000" } }) : reference;
  return expandStoredPath(resolved).path.split("/").some((segment) => Buffer.byteLength(segment) > 4_096 || gitSpecialSegment(segment));
}
