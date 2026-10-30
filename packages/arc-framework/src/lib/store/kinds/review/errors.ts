/** Stable version-conflict errors shared by typed access and filesystem adapters. */
import { StoreRefusalError } from "../../refusal-error.js";
import type { StoreRefusal } from "../../refusal.js";

/** A Candidate writer's exact mutation basis no longer matches the stored record. */
export class CandidateRecordVersionConflictError extends Error {
  constructor() {
    super("Candidate record changed after it was read");
    this.name = "CandidateRecordVersionConflictError";
  }
}

/** A boundary writer's exact mutation basis no longer matches the stored record. */
export class SubmissionBoundaryVersionConflictError extends Error {
  constructor() {
    super("Submission boundary changed after it was read");
    this.name = "SubmissionBoundaryVersionConflictError";
  }
}

/** A review fact writer's exact mutation basis no longer matches the stored record. */
export class ReviewFactVersionConflictError extends StoreRefusalError {
  constructor(refusal: Extract<StoreRefusal, { code: "version-conflict" }>, offBranch: boolean) {
    super(refusal, offBranch);
    this.name = "ReviewFactVersionConflictError";
  }
}
