/** Backend-independent decoding and admission for immutable review outcomes. */
import { defineKindRegistration } from "../../../registry.js";
import { decodeReviewOutcome } from "./parser.js";
import { checkReviewOutcome } from "./check.js";

export const REVIEW_OUTCOME_REGISTRATION = defineKindRegistration({
  kind: "review/outcome", parser: decodeReviewOutcome, check: checkReviewOutcome,
});
