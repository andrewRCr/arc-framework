/** Retain native local review ownership across preparation and operation-based re-entry. */
import type { ReviewGrantReferences } from "../policy/review-grant-references.js";
import { sameOwner, type OwnerIdentity } from "../../../lib/store/identity.js";
import type { RawGitExec } from "../../../lib/git/exec.js";
import { ProjectIdentityError } from "../../../lib/store/project-identity.js";
import { createReviewCompositionContext } from "./composition-context.js";
import { LocalAttestCommandError, LocalAttestRequestSchema } from "./local-attest-command.js";
import { LocalResumeCommandError, LocalResumeRequestSchema } from "./local-resume-command.js";
import { LocalCancelCommandError, LocalCancelRequestSchema } from "./local-cancel-command.js";
import { resolveReviewOperationInvocation, ReviewContinuationReferenceError } from "./continuation-invocation.js";
import { resolveReviewInvocation, type ReviewInvocationInput, type ReviewInvocationContext } from "./invocation.js";
import { readLocalReviewLiveContext, type ResolvedLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { resolveLocalReviewVehicle } from "../hosts/local/review-authority.js";

/** Invocation authority with the production selection retained for the command's subsequent checks. */
export interface LocalReviewInvocationInput extends ReviewInvocationInput {
  localLiveContext?: Promise<ResolvedLocalReviewLiveContext>;
  rawGit?: RawGitExec;
}

/** Retain the current primary for policy reads while leaving vehicle admission with its existing consumer. */
export async function resolveReviewPolicyInvocation(options: ReviewInvocationInput, references?: ReviewGrantReferences): Promise<ReviewInvocationInput & ReviewInvocationContext> {
  const input = { ...options, ...resolveReviewInvocation(options, references) };
  if (!input.store.capabilities.stateOffBranch) return input;
  await input.projectId();
  if (input.workItem !== undefined) return input;
  const live = await readLocalReviewLiveContext(input);
  return { ...input, ...(live.workItem === undefined ? {} : { workItem: live.workItem }) };
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
  const operations = createReviewCompositionContext(input).family.ports.inFlight;
  const { state } = await operations.readOperation(operationId).catch((error: unknown) => {
    if (error instanceof ProjectIdentityError) throw error;
    throw failure(`Restore the pending local review record and retry: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (state === null) return null;
  if (state.kind !== "local-review" || state.operationId !== operationId) {
    throw failure("local review operation is unavailable");
  }
  if (state.workItem === undefined) throw failure("local review operation has no selected work item");
  return state.workItem;
}

/** Bind a saved local operation's owner from its produced locator, refusing a locator naming another work item. */
async function resolveSavedLocalReviewInvocation(options: LocalReviewInvocationInput,
  request: { operationId: string; operationRef?: string }, failure: (message: string) => Error): Promise<LocalReviewInvocationInput> {
  const input = { ...options, ...await resolveReviewOperationInvocation(options, request, "arc review local prepare") };
  if (!input.store?.capabilities.stateOffBranch || (options.workItem !== undefined && request.operationRef === undefined)) return input;
  const savedOwner = await readLocalReviewOperationOwner(input, request.operationId, failure);
  if (savedOwner !== null && (input.workItem === undefined || !sameOwner(savedOwner, input.workItem))) {
    throw new ReviewContinuationReferenceError("operation reference names another work item", "arc review local prepare");
  }
  return input;
}

/** Bind resume from its produced locator, retaining pending-state validation without selecting a checkout vehicle. */
export async function resolveLocalReviewResumeInvocation(options: LocalReviewInvocationInput,
  requestInput: unknown): Promise<LocalReviewInvocationInput> {
  return resolveSavedLocalReviewInvocation(options, LocalResumeRequestSchema.parse(requestInput),
    message => new LocalResumeCommandError(message));
}

/** Bind attestation from its produced locator before opening its review family. */
export async function resolveLocalReviewAttestInvocation(options: LocalReviewInvocationInput,
  requestInput: unknown): Promise<LocalReviewInvocationInput> {
  return resolveSavedLocalReviewInvocation(options, LocalAttestRequestSchema.parse(requestInput),
    message => new LocalAttestCommandError("corrupt-state", message));
}

/** Bind cancellation from its produced locator before opening its review family. */
export async function resolveLocalReviewCancelInvocation(options: LocalReviewInvocationInput,
  requestInput: unknown): Promise<LocalReviewInvocationInput> {
  return resolveSavedLocalReviewInvocation(options, LocalCancelRequestSchema.parse(requestInput),
    message => new LocalCancelCommandError(message));
}
