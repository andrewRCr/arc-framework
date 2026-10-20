/** Select the exact native owner carried by a produced review source before opening family ports. */
import { bindNativeReviewOperationReference } from "../core/review-operation-reference.js";
import { sameOwner } from "../../../lib/store/identity.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { bindReviewSourceReference, parseReviewSourceReference, type BoundReviewSourceReference,
  type ReviewSourceReferenceCoordinates } from "../core/review-source-reference.js";
import { resolveReviewInvocation, type ReviewInvocationInput } from "./invocation.js";
import { resolveReviewOperationInvocation, ReviewContinuationReferenceError } from "./continuation-invocation.js";

/** Publish the selected native owner outside source identities while preserving repository encodings. */
export async function bindReviewSourceReferenceForInvocation(options: ReviewInvocationInput,
  reference: ReviewSourceReferenceCoordinates): Promise<string> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  if (!input.store.capabilities.stateOffBranch) return bindReviewSourceReference(reference);
  if (input.workItem === undefined) throw new Error("Resolve the native source owner before publishing its reference.");
  return bindReviewSourceReference({ ...reference, repositoryId: await input.projectId(), workItem: input.workItem });
}

/** Validate a source's kind and native coordinates while retaining project repair and internal bound calls. */
export async function resolveReviewSourceInvocation(options: ReviewInvocationInput,
  value: string, kind: BoundReviewSourceReference["kind"]): Promise<{
    invocation: ReviewInvocationInput; reference: BoundReviewSourceReference;
  }> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  const producer = kind === "hosted" ? "arc review hosted await"
    : kind === "frontline" ? "arc review frontline run or arc review reduce"
    : "arc review local attest, arc review local resume, or arc review reduce";
  const native = input.store.capabilities.stateOffBranch;
  if (native) await input.projectId();
  let reference: BoundReviewSourceReference;
  try { reference = parseReviewSourceReference(value, kind, native); }
  catch { throw new ReviewContinuationReferenceError("malformed or mismatched review source reference", producer); }
  if (!("workItem" in reference)) {
    if (native && input.workItem === undefined) throw new ReviewContinuationReferenceError(
      "native continuation requires an owner-bearing source reference", producer);
    return { invocation: input, reference };
  }
  const invocation = await resolveReviewOperationInvocation(input, { operationId: reference.operationId,
    operationRef: bindNativeReviewOperationReference({ repositoryId: reference.repositoryId,
      workItem: reference.workItem, operationId: reference.operationId }) }, producer);
  const operations = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(input.exec, input.cwd));
  const { state } = await operations.readOperation(reference.operationId);
  if (state !== null) {
    if (state.workItem === undefined) throw new Error(
      "Review source working state has no selected owner. Restore the admitted working-state record, then retry.");
    if (!sameOwner(state.workItem, reference.workItem)) throw new ReviewContinuationReferenceError(
      "review source reference names another work item", producer);
  }
  return { invocation, reference };
}
