/** Versioned boundary parsing and current-format write admission. */
import { defineKindRegistration } from "../../../registry.js";
import { decodeReviewIntegrationBoundary } from "./parser.js";
import { checkReviewIntegrationBoundary } from "./check.js";

export const REVIEW_INTEGRATION_BOUNDARY_REGISTRATION = defineKindRegistration({
  kind: "review/integration-boundary", parser: decodeReviewIntegrationBoundary, check: checkReviewIntegrationBoundary,
});
