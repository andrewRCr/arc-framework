/** Bind read-only reduction to the work item retained by its saved operation. */
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { ProjectIdentityError } from "../../../lib/store/project-identity.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { ReduceCommandError, ReduceRequestSchema } from "./reduce-command.js";
import { resolveReviewInvocation, type ReviewInvocationInput } from "./invocation.js";

/** Select the persisted operation without adding current vehicle or actor requirements. */
export async function resolveReduceInvocation(options: ReviewInvocationInput, requestInput: unknown): Promise<ReviewInvocationInput> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  if (!input.store.capabilities.stateOffBranch || input.workItem !== undefined) return input;
  const request = ReduceRequestSchema.parse(requestInput);
  try {
    const operations = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(input.exec, input.cwd));
    const { state } = await operations.readOperation(request.operationId);
    if (state === null || state.operationId !== request.operationId) throw new ReduceCommandError("review operation is unavailable");
    if (state.kind !== "local-review" && state.kind !== "frontline-run") throw new ReduceCommandError("operation kind is not reducible");
    if (state.workItem === undefined) throw new ReduceCommandError("review operation has no selected work item");
    return { ...input, workItem: state.workItem };
  } catch (error) {
    if (error instanceof ReduceCommandError || error instanceof ProjectIdentityError) throw error;
    throw new ReduceCommandError(error instanceof Error ? error.message : "review reduction cannot validate durable state");
  }
}
