/** Admit a complete archive root before reserving or replacing any of its paths. */
import type { RecordReference } from "../identity.js";
import type { StoreRefusal } from "../refusal.js";
import type { RefTreeEntry } from "./batch-read.js";
import { findRefPathCollision } from "./path-admission.js";

/** Only a captured owned folder may be refreshed in place; every other occupied destination stays intact. */
export function archiveDestinationRefusal(reference: RecordReference, ref: string, root: string,
  entries: Iterable<RefTreeEntry>, ownedRoot?: string): StoreRefusal | undefined {
  if (root === ownedRoot) return undefined;
  const occupied = [...entries].find(({ path }) => path === root.slice(0, -1) || path.startsWith(root));
  if (!occupied) return undefined;
  return { code: "record-malformed", class: "recoverable", reference, rule: "store.archive-destination",
    condition: `The archive destination root ${ref}:${root} already contains another retained folder or entry (${occupied.path}).`,
    remedy: { text: "Rename this owner to an unused archive name, choose a different completed quarter or placement, "
      + "or remove terminal lineage where present and reopen the item before ending it again; then retry. "
      + "Preserve the existing folder and its owner's metadata." } };
}

/** Check the complete copied namespace before a map can hide equality or a file/directory collision. */
export function archiveCopyNamespaceRefusal(reference: RecordReference, ref: string, root: string,
  copied: Iterable<RefTreeEntry>, retained: Iterable<RefTreeEntry>, removedRoot?: string, reservedMetadataPath?: string): StoreRefusal | undefined {
  const kept = [...retained].filter(entry => !(removedRoot && entry.path.startsWith(removedRoot))
    && !(entry.path === reservedMetadataPath && entry.oid === ""));
  const collision = findRefPathCollision([...kept.map(entry => entry.path), ...[...copied].map(entry => root + entry.path)]);
  if (!collision) return undefined;
  return { code: "record-malformed", class: "recoverable", reference, rule: "store.archive-path-namespace",
    condition: `The copied archive paths ${ref}:${collision.path} and ${ref}:${collision.other} cannot coexist.`,
    remedy: { text: "Rename or remove the colliding retained source entry in a new commit, preserving the owner's metadata, "
      + "or choose a distinct archive owner name or placement; then retry." } };
}
