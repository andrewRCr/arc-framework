/** Owner scope shared by current, saved, and prepared family listings. */

import type { ListInput } from "../read.js";
import { isArchiveRef } from "./archive-read.js";
import { rootFamily } from "./path-decode.js";

/** Narrow already selected family refs without discarding archive uncertainty for an ended owner. */
export function listingRefMatches(ref: string, input: ListInput, refs: ReadonlyMap<string, unknown>): boolean {
  if (!["work-item", "cohort"].includes(rootFamily(input.family))) return true;
  if (isArchiveRef(ref)) return !listingHasLiveOwner(refs, input);
  const owner = input.owner;
  return !owner || !("uid" in owner) || !owner.uid || ref.endsWith(`/${owner.uid}`);
}

/** A captured live ref supersedes the selected owner's former archive folders, even when unreadable. */
export function listingHasLiveOwner(refs: ReadonlyMap<string, unknown>, input: ListInput): boolean {
  const owner = input.owner;
  if (!owner || !("uid" in owner) || !owner.uid || !["work-item", "cohort"].includes(owner.type)) return false;
  return refs.has(`refs/arc/${owner.type === "work-item" ? "work" : "cohort"}/${owner.uid}`);
}
