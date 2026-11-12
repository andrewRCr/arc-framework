/** Whole-record Candidate parsing at the store boundary. */
import { defineKindRegistration } from "../../../registry.js";
import { decodeReviewCandidate } from "./parser.js";

export const REVIEW_CANDIDATE_REGISTRATION = defineKindRegistration({ kind: "review/candidate", parser: decodeReviewCandidate });
