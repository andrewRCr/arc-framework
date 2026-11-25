/** Retain and report open conflicts that cannot be drawn into a refused projected file. */
import { sameReference, type RecordReference } from "../identity.js";
import { formatConflictToken } from "../../status/conflict-token.js";
import type { RecordEntry, RefusedMark } from "./index-schema.js";

/** Find current open conflicts absent from both the file's marker and notice metadata. */
export function unshownConflicts(entry: RecordEntry, open: readonly RecordReference[]): RecordReference[] {
  const shown = [...entry.notices, ...(entry.markers?.sets.flatMap(set => set.shows === "stored" ? [set.conflict] : []) ?? [])];
  return open.filter(reference => !shown.some(candidate => sameReference(reference, candidate)));
}

/** Report unseen conflicts with the same repair that releases the held file. */
export function heldConflictMarks(unshown: readonly RecordReference[], mark: RefusedMark): RefusedMark[] {
  return unshown.map(reference => ({ reason: `unshown-conflict: ${formatConflictToken(reference)} is open but cannot be drawn into this held file.`,
    remedy: mark.remedy }));
}
