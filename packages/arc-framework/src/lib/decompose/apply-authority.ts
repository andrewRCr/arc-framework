/** Shared canonical authority for decomposition batches that remove stored records. */
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import type { CutMapMachine } from "./cut-map-machine.js";
import { canonicalDigest, sortByCanonicalBytes, type CanonicalDigest } from "../kernel/canonical/canonical-json.js";

/** The operation is part of authority, even when two modes would write identical bytes. */
export type DecomposeAuthorityMode = "retirement-finish" | "extraction-finish" | "discard" | "revise";

/** Bind approval to the operation, origin generation, observed versions, and exact prepared mutations. */
export function decomposeApplyAuthority(input: {
  mode: DecomposeAuthorityMode; origin: CutMapMachine["origin"]; records: readonly StoreRecord[]; writes: readonly Mutation[];
}): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 1, mode: input.mode, origin: input.origin,
    records: sortByCanonicalBytes(input.records.map(record => ({ reference: record.reference, version: record.version }))),
    writes: sortByCanonicalBytes(input.writes),
  });
}
