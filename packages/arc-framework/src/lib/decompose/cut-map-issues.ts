/** Deterministic author-actionable cut-map diagnostics. */
import { z } from "zod";

/** Closed diagnostic reasons shared by decoding and revision reports. */
export const CutMapIssueCodeSchema = z.enum([
  "unsupported-version", "invalid-structure", "incomplete-authoring", "machine-order", "machine-identity",
  "authoring-identity", "authoring-order", "source-shape", "companion-disposition", "destination-coverage",
  "placement-cardinality", "shape-cardinality",
]);

export interface CutMapIssue {
  code: z.infer<typeof CutMapIssueCodeSchema>;
  path: string;
  message: string;
}

