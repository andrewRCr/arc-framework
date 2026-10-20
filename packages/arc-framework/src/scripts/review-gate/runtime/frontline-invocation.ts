/** Retain the operational owner selected by a frontline admission across run invocations. */
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import type { FrontlineRunCommandRequest } from "../core/frontline-run-command-schema.js";
import { FrontlineOperationCorruptStateError } from "../policy/frontline-operation.js";
import { readValidatedFrontlineAdmission } from "./frontline-admission-validation.js";
import { FrontlineRunCommandError } from "./frontline-run-command.js";
import { resolveReviewInvocation, type ReviewInvocationInput } from "./invocation.js";

/** Bind the exact persisted admission's work item without requiring a current checkout vehicle or actor. */
export async function resolveFrontlineRunInvocation(options: ReviewInvocationInput,
  request: Pick<FrontlineRunCommandRequest, "target" | "resolution">): Promise<ReviewInvocationInput> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  if (!input.store.capabilities.stateOffBranch || input.workItem !== undefined) return input;
  if (request.resolution.state !== "ready") throw new FrontlineRunCommandError("frontline run requires a ready resolution");
  const operations = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(input.exec, input.cwd));
  const owner = await readValidatedFrontlineAdmission(operations, request.resolution.payload.admission, request.target);
  if (owner.workItem === undefined) throw new FrontlineOperationCorruptStateError("frontline admission has no selected work item");
  return { ...input, workItem: owner.workItem };
}
