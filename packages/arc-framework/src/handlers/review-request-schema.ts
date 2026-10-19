/** Public request schema discovery for the review command family. */
import { z } from "zod";
import { lookupKernelSchema } from "../lib/kernel/schema/generate.js";
import {
  REVIEW_FRONTLINE_RESOLVE_REQUEST_SCHEMA_ID,
  REVIEW_HOSTED_AWAIT_REQUEST_SCHEMA_ID,
  REVIEW_HOSTED_REQUEST_REQUEST_SCHEMA_ID,
  REVIEW_HOSTED_SETTLE_REQUEST_SCHEMA_ID,
  REVIEW_LOCAL_ATTEST_REQUEST_SCHEMA_ID,
  REVIEW_LOCAL_PREPARE_REQUEST_SCHEMA_ID,
  REVIEW_LOCAL_RESUME_REQUEST_SCHEMA_ID,
  REVIEW_READINESS_REQUEST_SCHEMA_ID,
  REVIEW_LANE_READ_REQUEST_SCHEMA_ID,
  REVIEW_REDUCE_REQUEST_SCHEMA_ID,
  REVIEW_RESOLVE_REQUEST_SCHEMA_ID,
  REVIEW_RESPOND_REQUEST_SCHEMA_ID,
  REVIEW_TERMINUS_ACCEPT_REQUEST_SCHEMA_ID,
} from "../scripts/review-gate/request-command-schemas.js";
import { REVIEW_CHUNKING_RESOLVE_REQUEST_SCHEMA_ID } from "../scripts/review-gate/core/review-chunking-command-schema.js";
import { REVIEW_PLANNING_GROOMING_RESOLVE_REQUEST_SCHEMA_ID } from "../scripts/review-gate/core/planning-grooming-command-schema.js";
import { REVIEW_FRONTLINE_RUN_REQUEST_SCHEMA_ID } from "../scripts/review-gate/core/frontline-run-command-schema.js";
import { createProductionSchemaRegistry } from "../production-schema-registry.js";

/** Validate that exactly one request source or schema discovery was selected. */
export function reviewDiscoverableCommandInputSchema() {
  return z.strictObject({
    input: z.string().trim().min(1).optional(),
    schema: z.literal(true).optional(),
  }).refine((input) => (input.input === undefined) !== (input.schema === undefined), {
    message: "Provide exactly one JSON request source or --schema.",
  });
}

export type ReviewPublicRequestSchemaId =
  | typeof REVIEW_CHUNKING_RESOLVE_REQUEST_SCHEMA_ID
  | typeof REVIEW_PLANNING_GROOMING_RESOLVE_REQUEST_SCHEMA_ID
  | typeof REVIEW_FRONTLINE_RUN_REQUEST_SCHEMA_ID
  | typeof REVIEW_RESOLVE_REQUEST_SCHEMA_ID
  | typeof REVIEW_HOSTED_AWAIT_REQUEST_SCHEMA_ID
  | typeof REVIEW_REDUCE_REQUEST_SCHEMA_ID
  | typeof REVIEW_RESPOND_REQUEST_SCHEMA_ID
  | typeof REVIEW_HOSTED_REQUEST_REQUEST_SCHEMA_ID
  | typeof REVIEW_READINESS_REQUEST_SCHEMA_ID
  | typeof REVIEW_LANE_READ_REQUEST_SCHEMA_ID
  | typeof REVIEW_FRONTLINE_RESOLVE_REQUEST_SCHEMA_ID
  | typeof REVIEW_HOSTED_SETTLE_REQUEST_SCHEMA_ID
  | typeof REVIEW_LOCAL_PREPARE_REQUEST_SCHEMA_ID
  | typeof REVIEW_LOCAL_ATTEST_REQUEST_SCHEMA_ID
  | typeof REVIEW_LOCAL_RESUME_REQUEST_SCHEMA_ID
  | typeof REVIEW_TERMINUS_ACCEPT_REQUEST_SCHEMA_ID;

/** Emit one public request root together with only the registry documents its refs require. */
export function handleReviewRequestSchema(
  schemaId: ReviewPublicRequestSchemaId,
  source?: string,
  overrides: { write(text: string): void; setExitCode(code: number): void } = {
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
  },
): void {
  try {
    reviewDiscoverableCommandInputSchema().parse({ input: source, schema: true });
    const result = lookupKernelSchema(createProductionSchemaRegistry(), schemaId);
    if (result.status === "unknown") throw new Error(`Review request schema unavailable: ${schemaId}`);
    const schema = result.schema;
    overrides.write(`${JSON.stringify({ rootId: schema.$id, schemas: { [schemaId]: schema } })}\n`);
  } catch (error) {
    overrides.write(`${JSON.stringify({
      rootId: `urn:arc:schema:${schemaId}`,
      schemas: {},
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    overrides.setExitCode(1);
  }
}
