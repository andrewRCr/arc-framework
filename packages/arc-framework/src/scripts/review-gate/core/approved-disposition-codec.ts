/** Pure decoding of repository-persisted approved disposition lineages. */
import { ApprovedDispositionRecordSchema, type ApprovedDispositionRecord } from "./advisory-records.js";
import { validateDispositionState } from "./dispositions.js";

/** Decode every approved set with the same structural and canonical checks as repository enumeration. */
export function parseApprovedDispositionRecord(raw: string): ApprovedDispositionRecord {
  const record = ApprovedDispositionRecordSchema.parse(JSON.parse(raw));
  const approvedDispositionLineage = record.approvedDispositionLineage.map((node) => {
    const approvedDisposition = validateDispositionState(node.approvedDisposition);
    if (approvedDisposition.state !== "approved") throw new Error("disposition record requires approval");
    return { ...node, approvedDisposition };
  });
  return ApprovedDispositionRecordSchema.parse({ ...record, approvedDispositionLineage });
}
