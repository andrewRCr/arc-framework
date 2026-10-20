/** Retain native local review ownership across preparation and operation-based re-entry. */
import { sameOwner, type OwnerIdentity } from "../../../lib/store/identity.js";
import type { RawGitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { LocalAttestCommandError, LocalAttestRequestSchema } from "./local-attest-command.js";
import { LocalResumeCommandError, LocalResumeRequestSchema } from "./local-resume-command.js";
import { resolveReviewOperationInvocation, ReviewContinuationReferenceError } from "./continuation-invocation.js";
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

async function readLocalReviewOperationOwner(input: LocalReviewInvocationInput, operationId: string,
  failure: (message: string) => Error): Promise<OwnerIdentity | null> {
  const operations = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(input.exec, input.cwd));
  const { state } = await operations.readOperation(operationId);
  if (state === null) return null;
  if (state.kind !== "local-review" || state.operationId !== operationId) {
    throw failure("local review operation is unavailable");
  }
  if (state.workItem === undefined) throw failure("local review operation has no selected work item");
  return state.workItem;
}

/** Bind resume from its produced locator, retaining pending-state validation without selecting a checkout vehicle. */
export async function resolveLocalReviewResumeInvocation(options: LocalReviewInvocationInput,
  requestInput: unknown): Promise<LocalReviewInvocationInput> {
  const request = LocalResumeRequestSchema.parse(requestInput);
  const input = { ...options, ...await resolveReviewOperationInvocation(options, request, "arc review local prepare") };
  if (!input.store?.capabilities.stateOffBranch || (options.workItem !== undefined && request.operationRef === undefined)) return input;
  const savedOwner = await readLocalReviewOperationOwner(input, request.operationId, message => new LocalResumeCommandError(message));
  if (savedOwner !== null && (input.workItem === undefined || !sameOwner(savedOwner, input.workItem))) {
    throw new ReviewContinuationReferenceError("operation reference names another work item", "arc review local prepare");
  }
  return input;
}

/** Bind attestation from its produced locator before opening its review family. */
export async function resolveLocalReviewAttestInvocation(options: LocalReviewInvocationInput,
  requestInput: unknown): Promise<LocalReviewInvocationInput> {
  const request = LocalAttestRequestSchema.parse(requestInput);
  const input = { ...options, ...await resolveReviewOperationInvocation(options, request, "arc review local prepare") };
  if (!input.store?.capabilities.stateOffBranch || (options.workItem !== undefined && request.operationRef === undefined)) return input;
  const savedOwner = await readLocalReviewOperationOwner(input, request.operationId,
    message => new LocalAttestCommandError("corrupt-state", message));
  if (savedOwner !== null && (input.workItem === undefined || !sameOwner(savedOwner, input.workItem))) {
    throw new ReviewContinuationReferenceError("operation reference names another work item", "arc review local prepare");
  }
  return input;
}
