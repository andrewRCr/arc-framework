/** Conflict completeness at review-specific related-record admission boundaries. */
import { recordConflictRefusal } from "../../conflict-diagnostics.js";
import type { StoreRecord } from "../../read.js";
import type { BrokenRule } from "../../write-check.js";

/** Refuse uncertain related facts while retaining the affected record and resolution route. */
export function reviewRecordConflict(record: StoreRecord, rule: string): BrokenRule | null {
  if (record.conflicts.length === 0) return null;
  const refusal = recordConflictRefusal(record, `Review record ${JSON.stringify(record.reference)}`, rule);
  return { rule, condition: refusal.condition, remedy: refusal.remedy };
}
