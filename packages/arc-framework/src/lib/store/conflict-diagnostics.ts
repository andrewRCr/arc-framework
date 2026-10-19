/** Concrete conflict identities and their resolution route for operational diagnostics. */
import type { RecordReference } from "./identity.js";

/** Retain every returned conflict reference; a non-conflict refusal gains no conflict advice. */
export function describeRecordConflicts(conflicts: readonly RecordReference[]): string {
  return conflicts.length === 0 ? "" : ` Conflict records: ${conflicts.map(reference => JSON.stringify(reference)).join(", ")}. Resolve the named conflict records, then retry.`;
}
