/** Canonical response ownership projected from the resolved approval record. */
import type { ApprovedDispositionRecord } from "../../../../../scripts/review-gate/core/advisory-records.js";
import type { ReviewEvidence } from "./schema.js";

/** Preserve the resolved Candidate, Errand, and member binding at approval. */
export function reviewEvidenceBindingForRecord(record: ApprovedDispositionRecord): ReviewEvidence["binding"] {
  if (record.errand !== null) return { kind: "errand", errand: record.errand };
  if (record.candidate !== null && record.deliveryMember !== null) {
    return { kind: "candidate-member", candidate: record.candidate, deliveryMember: record.deliveryMember };
  }
  if (record.candidate !== null) return { kind: "candidate", candidate: record.candidate };
  return record.deliveryMember === null ? null : { kind: "delivery-member", deliveryMember: record.deliveryMember };
}
