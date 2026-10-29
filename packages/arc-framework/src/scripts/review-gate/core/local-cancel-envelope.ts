/** Public outcomes for cancelling a local review dispatch without evaluator evidence. */

import { z } from "zod";
import { ReviewIdentifierSchema } from "./gate-contract-v2-schema.js";
import { ReviewCommandDiagnosticSchema } from "./review-command-diagnostic.js";

const Header = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-local-cancel"),
  diagnostics: z.array(ReviewCommandDiagnosticSchema),
  payload: z.strictObject({
    operationId: ReviewIdentifierSchema,
    persistedVersion: z.number().int().positive(),
  }),
};

export const LocalCancelEnvelopeSchema = z.discriminatedUnion("state", [
  z.strictObject({ ...Header, state: z.literal("cancelled"), nextAction: z.literal("rerun-review") }),
  z.strictObject({ ...Header, state: z.literal("terminal-operation"), nextAction: z.literal("resume-review") }),
]);
