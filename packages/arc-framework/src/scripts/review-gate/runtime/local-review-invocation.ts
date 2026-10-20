/** Retain native local review ownership across preparation and operation-based re-entry. */
import type { RawGitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { LocalResumeCommandError, LocalResumeRequestSchema } from "./local-resume-command.js";
import { resolveReviewInvocation, type ReviewInvocationInput } from "./invocation.js";
import { readLocalReviewLiveContext, type ResolvedLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { resolveLocalReviewVehicle } from "../hosts/local/review-authority.js";

/** Invocation authority with the production selection retained for the command's subsequent checks. */
export interface LocalReviewInvocationInput extends ReviewInvocationInput {
  localLiveContext?: Promise<ResolvedLocalReviewLiveContext>;
  rawGit?: RawGitExec;
}

/** Resolve the existing local vehicle, retaining its exact primary while preserving an already bound owner. */
export async function resolveLocalReviewInvocation(options: LocalReviewInvocationInput): Promise<LocalReviewInvocationInput> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  if (!input.store.capabilities.stateOffBranch || input.workItem !== undefined) return input;
  const live = await readLocalReviewLiveContext(input);
  await resolveLocalReviewVehicle({}, { readLiveContext: () => Promise.resolve(live.context) });
  return { ...input, ...(live.workItem === undefined ? {} : { workItem: live.workItem }), localLiveContext: Promise.resolve(live) };
}

/** Retain the owner selected by the persisted operation without selecting the current checkout's vehicle. */
export async function resolveLocalReviewResumeInvocation(options: LocalReviewInvocationInput,
  requestInput: unknown): Promise<LocalReviewInvocationInput> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  if (!input.store.capabilities.stateOffBranch || input.workItem !== undefined) return input;
  const request = LocalResumeRequestSchema.parse(requestInput);
  const operations = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(input.exec, input.cwd));
  const { state } = await operations.readOperation(request.operationId);
  if (state?.kind !== "local-review" || state.operationId !== request.operationId) {
    throw new LocalResumeCommandError("local review operation is unavailable");
  }
  if (state.workItem === undefined) throw new LocalResumeCommandError("local review operation has no selected work item");
  return { ...input, workItem: state.workItem };
}
