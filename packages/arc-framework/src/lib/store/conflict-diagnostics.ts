/** Concrete conflict identities and their resolution route for operational diagnostics. */
import type { RecordReference } from "./identity.js";

/** The resolution route for every named conflict record. */
export const RESOLVE_RECORD_CONFLICTS = "Resolve the named conflict records, then retry.";

/** Name every returned conflict reference. */
export function listRecordConflicts(conflicts: readonly RecordReference[]): string {
  return `Conflict records: ${conflicts.map(reference => JSON.stringify(reference)).join(", ")}.`;
}

/** Retain every returned conflict reference; a non-conflict refusal gains no conflict advice. */
export function describeRecordConflicts(conflicts: readonly RecordReference[]): string {
  return conflicts.length === 0 ? "" : ` ${listRecordConflicts(conflicts)} ${RESOLVE_RECORD_CONFLICTS}`;
}
