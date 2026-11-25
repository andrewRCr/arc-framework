/** A project-identity stop always carries an executable repair route. */
import { expect, it } from "vitest";
import { ReviewCommandErrorEnvelopeSchema, ReviewCommandModeSchema } from "../../../../../src/scripts/review-gate/core/review-command-envelope.js";
import { spineRemedy } from "../../../../../src/scripts/integration/spine-refusal.js";

it.each(ReviewCommandModeSchema.options)("requires a remedy for %s project-identity errors", mode => {
  const error = { schemaVersion: 1, mode, diagnostics: [],
    error: { code: "project-identity-unavailable", message: "Project identity is missing." } };
  expect.soft(ReviewCommandErrorEnvelopeSchema.safeParse(error).success).toBe(false);
  expect.soft(ReviewCommandErrorEnvelopeSchema.safeParse({ ...error,
    remedy: spineRemedy("Project identity is missing.", "Restore its record, then retry", ["arc", "review", "resolve", "-"], {}) }).success).toBe(true);
});
