/** Public whole-record Candidate content, versioned read shape, and codec. */
export { CandidateManagedRecordV1Schema, type CandidateManagedRecordV1, type VersionedCandidateRecord } from "./schema.js";
export { parseReviewCandidate, decodeReviewCandidate } from "./parser.js";
export { REVIEW_CANDIDATE_REGISTRATION } from "./registration.js";
