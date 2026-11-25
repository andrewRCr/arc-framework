/** Shared request-source and schema-discovery dispatch for review CLI actions. */
import type { InteractionContext } from "./interaction-context.js";
import type { ReviewPublicRequestSchemaId } from "../../handlers/review-request-schema.js";

/** Bind schema discovery while preserving the command's resolved interaction context. */
export function reviewRequestAction(schemaId: ReviewPublicRequestSchemaId,
  execute: (source: string, context: InteractionContext) => Promise<void>,
): (context: InteractionContext, input: string | undefined, options: { schema?: boolean }) => Promise<void> {
  return async (context, input, options) => {
    if (options.schema === true) {
      (await import("../../handlers/review-request-schema.js")).handleReviewRequestSchema(schemaId, input);
      return;
    }
    await execute(input ?? "", context);
  };
}
