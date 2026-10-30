/** Concrete conflict identities and their resolution route for operational diagnostics. */
import type { RecordReference } from "./identity.js";
import type { StoreRefusal } from "./refusal.js";

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

/** A conflicted record as a recoverable refusal naming every conflict and how to resolve them. */
export function recordConflictRefusal(record: { reference: RecordReference; conflicts: readonly RecordReference[] }, subject: string,
  rule: string): Extract<StoreRefusal, { code: "record-malformed" }> {
  return { code: "record-malformed", class: "recoverable", reference: record.reference, rule,
    condition: `${subject} has unresolved conflicts. ${listRecordConflicts(record.conflicts)}`, remedy: { text: RESOLVE_RECORD_CONFLICTS } };
}
