/** Backend-independent decoding and admission for immutable review decisions. */
import { defineKindRegistration } from "../../../registry.js";
import { decodeReviewDecision } from "./parser.js";
import { checkReviewDecision } from "./check.js";

export const REVIEW_DECISION_REGISTRATION = defineKindRegistration({
  kind: "review/decision", parser: decodeReviewDecision, check: checkReviewDecision,
});
