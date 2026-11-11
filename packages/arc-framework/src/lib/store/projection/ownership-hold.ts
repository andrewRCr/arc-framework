/** A path with two journaled record identities cannot authorize an authored write to either. */
import type { RecordEntry, RefusedMark } from "./index-schema.js";
import type { TakeInResult } from "./take-in-port.js";

/** Name both retained identities and the ordinary route to recover ambiguous bytes. */
export function ownershipHandoffMark(entry: RecordEntry): RefusedMark {
  return { reason: `withheld: Ownership handoff from ${JSON.stringify(entry.reference)} to ${JSON.stringify(entry.handoff?.reference)} is unconfirmed.`,
    remedy: { text: "Copy out anything wanted, then delete the withheld file and reapply the edit after it is projected again." } };
}

/** Refuse before preparing a store mutation whenever both record identities remain authoritative. */
export function refuseOwnershipHandoff(entry: RecordEntry): Extract<TakeInResult, { answer: "refused" | "unparseable" }> | null {
  if (entry.handoff === undefined) return null;
  const mark = ownershipHandoffMark(entry);
  return { answer: "refused", entry: { ...entry, pending: true, withheld: true, refused: mark }, mark };
}
