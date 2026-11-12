/** Backend-independent content parsing and write admission for approved responses. */
import { defineKindRegistration } from "../../../registry.js";
import { decodeReviewEvidence } from "./parser.js";
import { checkReviewEvidence } from "./check.js";

export const REVIEW_EVIDENCE_REGISTRATION = defineKindRegistration({
  kind: "review/evidence", parser: decodeReviewEvidence, check: checkReviewEvidence,
});
