/** Whole Candidate content and its opaque store version. */
import type { CandidateManagedRecordV1 } from "../../../../work-unit/candidate-attestation.js";

export { CandidateManagedRecordV1Schema, type CandidateManagedRecordV1 } from "../../../../work-unit/candidate-attestation.js";

/** A present or absent Candidate with the backend's compare-and-swap version. */
export interface VersionedCandidateRecord {
  record: CandidateManagedRecordV1 | null;
  version: string | null;
}
