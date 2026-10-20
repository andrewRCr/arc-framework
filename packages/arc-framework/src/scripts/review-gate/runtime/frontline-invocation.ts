/** Retain the operational owner selected by a frontline admission across run invocations. */
import { sameOwner } from "../../../lib/store/identity.js";
import { resolveReviewOperationInvocation, ReviewContinuationReferenceError } from "./continuation-invocation.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import type { FrontlineRunCommandRequest } from "../core/frontline-run-command-schema.js";
import { FrontlineOperationCorruptStateError } from "../policy/frontline-operation.js";
import { readValidatedFrontlineAdmission } from "./frontline-admission-validation.js";
import { FrontlineRunCommandError } from "./frontline-run-command.js";
import { type ReviewInvocationInput } from "./invocation.js";

/** Bind the exact persisted admission's work item without requiring a current checkout vehicle or actor. */
export async function resolveFrontlineRunInvocation(options: ReviewInvocationInput,
  request: Pick<FrontlineRunCommandRequest, "target" | "resolution">): Promise<ReviewInvocationInput> {
  if (request.resolution.state !== "ready") throw new FrontlineRunCommandError("frontline run requires a ready resolution");
  const { admission, operationRef } = request.resolution.payload;
  const input = await resolveReviewOperationInvocation(options, { operationId: admission.operationId, operationRef },
    "arc review frontline resolve");
  if (!input.store?.capabilities.stateOffBranch || (options.workItem !== undefined && operationRef === undefined)) return input;
  const operations = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(input.exec, input.cwd));
  const owner = await readValidatedFrontlineAdmission(operations, request.resolution.payload.admission, request.target);
  if (owner.workItem === undefined) throw new FrontlineOperationCorruptStateError("frontline admission has no selected work item");
  if (input.workItem === undefined || !sameOwner(owner.workItem, input.workItem)) {
    throw new ReviewContinuationReferenceError("frontline reference names another work item", "arc review frontline resolve");
  }
  return input;
}
