/** Shared canonical authority for decomposition batches that remove stored records. */
import type { StoreRecord } from "../store/read.js";
import type { Mutation, RecordObservation } from "../store/write.js";
import type { CutMapMachine } from "./cut-map-machine.js";
import { canonicalDigest, sortByCanonicalBytes, type CanonicalDigest } from "../kernel/canonical/canonical-json.js";
import { observeRecords, canonicalRecordObservations } from "../store/record-observations.js";

/** The operation is part of authority, even when two modes would write identical bytes. */
export type DecomposeAuthorityMode = "retirement-finish" | "extraction-finish" | "discard" | "revise";

/** Bind approval to the operation, origin generation, observed versions, and exact prepared mutations. */
export function decomposeApplyAuthority(input: {
  mode: DecomposeAuthorityMode; origin: CutMapMachine["origin"]; records: readonly StoreRecord[]; writes: readonly Mutation[];
  observations?: readonly RecordObservation[];
}): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 2, mode: input.mode, origin: input.origin,
    observations: canonicalRecordObservations([...observeRecords(input.records), ...input.observations ?? []]),
    writes: sortByCanonicalBytes(input.writes),
  });
}
