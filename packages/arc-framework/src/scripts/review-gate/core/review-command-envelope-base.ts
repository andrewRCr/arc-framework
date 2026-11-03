/** Shared command headers and operation-coordinate checks for review result envelopes. */
import { z } from "zod";
import { nativeReviewOperationReferenceMatches } from "./review-operation-reference.js";
import { ReviewCommandDiagnosticSchema } from "./review-command-diagnostic.js";
import type { ReviewCommandMode } from "./review-command-mode.js";
export { ReviewCommandModeSchema, type ReviewCommandMode } from "./review-command-mode.js";
export { ReviewCommandDiagnosticSchema } from "./review-command-diagnostic.js";

export const ReviewCommandHeaderShape = {
  schemaVersion: z.literal(1),
  diagnostics: z.array(ReviewCommandDiagnosticSchema),
};

function validateOperationPayload(payload: unknown, context: z.RefinementCtx): void {
  if (payload === null || typeof payload !== "object" || !("operationId" in payload)
    || typeof payload.operationId !== "string") return;
  const reference = "operationRef" in payload ? payload.operationRef : undefined;
  if (typeof reference === "string" && !nativeReviewOperationReferenceMatches(reference, payload.operationId)) {
    context.addIssue({ code: "custom", path: ["payload", "operationRef"],
      message: "native reference must match the envelope's operation ID" });
  }
  if ("persistedVersion" in payload && payload.persistedVersion === 0 && reference === undefined) {
    context.addIssue({ code: "custom", path: ["payload", "persistedVersion"],
      message: "an absent working-state version requires a native operation reference" });
  }
}

/** Build one strict transition envelope and validate any embedded operation coordinates. */
export function reviewCommandEnvelopeVariant<
  Mode extends ReviewCommandMode,
  State extends string,
  NextAction extends string,
  Payload extends z.ZodType,
>(
  mode: Mode,
  state: State,
  nextAction: NextAction,
  payload: Payload,
): z.ZodObject<{
  schemaVersion: z.ZodLiteral<1>;
  diagnostics: z.ZodArray<typeof ReviewCommandDiagnosticSchema>;
  mode: z.ZodLiteral<Mode>;
  state: z.ZodLiteral<State>;
  nextAction: z.ZodLiteral<NextAction>;
  payload: Payload;
}> {
  return z.strictObject({
    ...ReviewCommandHeaderShape,
    mode: z.literal(mode),
    state: z.literal(state),
    nextAction: z.literal(nextAction),
    payload,
  }).superRefine((envelope, context) => {
    if ("payload" in envelope) validateOperationPayload(envelope.payload, context);
  });
}
