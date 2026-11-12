/** Stable errors shared by typed review access and filesystem adapters. */
import { StoreRefusalError } from "../../refusal-error.js";
import type { Remedy, StoreRefusal } from "../../refusal.js";

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

/** A work-item selection review records cannot use, with the code the command reports and the act that repairs it. */
export class ReviewOwnerSelectionError extends Error {
  constructor(readonly code: "invalid-input" | "corrupt-state", readonly condition: string, readonly remedy: Remedy) {
    super(`${condition} ${remedy.text}`);
    this.name = "ReviewOwnerSelectionError";
  }
}

const REVIEW_VEHICLE_REMEDY: Remedy = { text: "Run the command from the checkout of the work unit or Errand under review, "
  + "open an Errand for the change with arc errand open, or name the delivery member the request reviews." };

/** A review command whose checkout holds neither exactly one work unit or Errand nor a named delivery member to review. */
export class ReviewVehicleUnresolvedError extends ReviewOwnerSelectionError {
  readonly reason = "vehicle-unresolved" as const;

  constructor(condition: string) {
    super("invalid-input", condition, REVIEW_VEHICLE_REMEDY);
    this.name = "ReviewVehicleUnresolvedError";
  }
}
