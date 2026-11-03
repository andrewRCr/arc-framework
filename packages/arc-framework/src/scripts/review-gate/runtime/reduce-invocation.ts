/** Bind native reduction from its portable owner locator while validating pending operation state. */
import { isOffBranchStoreRefusal } from "../../../lib/store/refusal-error.js";
import { createReviewCompositionContext } from "./composition-context.js";
import { ProjectIdentityError } from "../../../lib/store/project-identity.js";
import { ReduceCommandError, ReduceRequestSchema } from "./reduce-command.js";
import type { ReviewInvocationInput } from "./invocation.js";
import { resolveReviewOperationInvocation, ReviewContinuationReferenceError } from "./continuation-invocation.js";

/** Select the persisted operation without adding current vehicle or actor requirements. */
export async function resolveReduceInvocation(options: ReviewInvocationInput, requestInput: unknown): Promise<ReviewInvocationInput> {
  const request = ReduceRequestSchema.parse(requestInput);
  const input = await resolveReviewOperationInvocation(options, request, "arc review local prepare or arc review frontline resolve");
  if (!input.store?.capabilities.stateOffBranch || (options.workItem !== undefined && request.operationRef === undefined)) return input;
  try {
    const operations = createReviewCompositionContext(input).family.ports.inFlight;
    const { state } = await operations.readOperation(request.operationId);
    if (state === null) return input;
    if (state.operationId !== request.operationId) throw new ReduceCommandError("review operation is unavailable");
    if (state.kind !== "local-review" && state.kind !== "frontline-run") throw new ReduceCommandError("operation kind is not reducible");
    return input;
  } catch (error) {
    if (error instanceof ReviewContinuationReferenceError || error instanceof ReduceCommandError || error instanceof ProjectIdentityError
      || isOffBranchStoreRefusal(error)) throw error;
    throw new ReduceCommandError(`Restore the pending review record and retry: ${error instanceof Error ? error.message : String(error)}`);
  }
}
