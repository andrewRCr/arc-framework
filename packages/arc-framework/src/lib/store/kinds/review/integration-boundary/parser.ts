/** Version-dispatched JSON reading for Candidate publication boundaries. */
import { parseIntegrationBoundaryLocus } from "../../../../../scripts/review-gate/policy/integration-boundary-locus.js";
import { IntegrationBoundaryLocusV2Schema, type ReviewIntegrationBoundary } from "./schema.js";
import { z } from "zod";

/** Parse a persisted boundary under its declared format version. */
export function parseReviewIntegrationBoundary(content: string): ReviewIntegrationBoundary | null {
  const decoded = decodeReviewIntegrationBoundary(content);
  return decoded.success ? decoded.data : null;
}

/** Decode either boundary version, retaining the existing version-one normalization and precise refusals. */
export function decodeReviewIntegrationBoundary(content: string): { success: true; data: ReviewIntegrationBoundary } | { success: false; error: string } {
  let value: unknown;
  try { value = JSON.parse(content) as unknown; }
  catch (error) { return { success: false, error: `JSON: ${error instanceof Error ? error.message : String(error)}` }; }
  try {
    const versionOne = value !== null && typeof value === "object" && "schemaVersion" in value && value.schemaVersion === 1;
    return { success: true, data: versionOne ? parseIntegrationBoundaryLocus(value) : IntegrationBoundaryLocusV2Schema.parse(value) };
  } catch (error) {
    return { success: false, error: error instanceof z.ZodError
      ? error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")
      : error instanceof Error ? error.message : String(error) };
  }
}
