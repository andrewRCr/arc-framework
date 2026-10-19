/** Complete production parser and write-check set for storage backends. */
import type { RegisteredKind } from "../registry.js";
import { IN_REPO_REGISTRATIONS } from "./in-repo-registrations.js";
import { REVIEW_OUTCOME_REGISTRATION } from "./review/outcome/registration.js";
import { REVIEW_DECISION_REGISTRATION } from "./review/decision/registration.js";
import { REVIEW_EVIDENCE_REGISTRATION } from "./review/evidence/registration.js";
import { REVIEW_ADVERSARIAL_PASS_REGISTRATION } from "./review/adversarial-pass/registration.js";
import { REVIEW_CANDIDATE_REGISTRATION } from "./review/candidate/registration.js";
import { REVIEW_INTEGRATION_BOUNDARY_REGISTRATION } from "./review/integration-boundary/registration.js";

export { RECORD_LINK_KINDS } from "./in-repo-registrations.js";

/** All kind-owned codecs and semantic admission checks. */
export const PRODUCTION_REGISTRATIONS: readonly RegisteredKind[] = [
  ...IN_REPO_REGISTRATIONS,
  REVIEW_OUTCOME_REGISTRATION, REVIEW_DECISION_REGISTRATION, REVIEW_EVIDENCE_REGISTRATION, REVIEW_ADVERSARIAL_PASS_REGISTRATION, REVIEW_CANDIDATE_REGISTRATION, REVIEW_INTEGRATION_BOUNDARY_REGISTRATION,
];
