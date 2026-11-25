/** Content decoding and activity-key admission for advisory adversarial passes. */
import { defineKindRegistration } from "../../../registry.js";
import { decodeReviewAdversarialPass } from "./parser.js";
import { checkReviewAdversarialPass } from "./check.js";

export const REVIEW_ADVERSARIAL_PASS_REGISTRATION = defineKindRegistration({
  kind: "review/adversarial-pass", parser: decodeReviewAdversarialPass, check: checkReviewAdversarialPass,
});
