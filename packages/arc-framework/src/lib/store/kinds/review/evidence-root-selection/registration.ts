/** Production parsing and semantic admission for explicit approval-root choices. */
import { defineKindRegistration } from "../../../registry.js";
import { decodeReviewEvidenceRootSelection } from "./parser.js";
import { checkReviewEvidenceRootSelection } from "./check.js";

export const REVIEW_EVIDENCE_ROOT_SELECTION_REGISTRATION = defineKindRegistration({
  kind: "review/evidence-root-selection", parser: decodeReviewEvidenceRootSelection, check: checkReviewEvidenceRootSelection,
});
