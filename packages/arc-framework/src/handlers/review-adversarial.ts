/** Record approved adversarial passes through the review JSON command boundary. */
import { ReviewAdversarialRecordRequestSchema, ReviewAdversarialRecordEnvelopeSchema } from "../scripts/review-gate/core/adversarial-record-schema.js";
import { defaultReviewHandlerBoundary, executeReviewHandler, type ReviewHandlerBoundary } from "./review-handler.js";
import { recordApprovedAdversarialPass } from "../scripts/review-gate/runtime/adversarial-record-command.js";
import { createGitExec } from "../lib/io-context.js";
import type { GitExec } from "../lib/git/exec.js";
import type { ReviewInvocationOptions } from "../scripts/review-gate/runtime/invocation.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";

/** Validate and record one disposition-approved pass, emitting one JSON envelope. */
export async function handleReviewAdversarialRecord(source: string,
  overrides: Partial<ReviewHandlerBoundary> = {}, context?: InteractionContext, invocation: ReviewInvocationOptions & { exec?: GitExec } = {}): Promise<void> {
  await executeReviewHandler({ mode: "review-adversarial-record", source,
    requestSchema: ReviewAdversarialRecordRequestSchema, resultSchema: ReviewAdversarialRecordEnvelopeSchema,
    dependencies: { ...defaultReviewHandlerBoundary(), ...overrides },
    execute: (request, root) => recordApprovedAdversarialPass(ReviewAdversarialRecordRequestSchema.parse(request),
      { ...invocation, cwd: root, exec: invocation.exec ?? createGitExec(context?.subprocess) }),
  });
}
