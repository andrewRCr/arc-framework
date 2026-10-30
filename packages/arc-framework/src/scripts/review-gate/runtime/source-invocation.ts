/** Select the exact native owner carried by a produced review source before opening family ports. */
import { bindNativeReviewOperationReference } from "../core/review-operation-reference.js";
import { bindReviewSourceReference, parseReviewSourceReference, parseReviewSourceReferenceForOwner, type ReviewSourceReferenceOwner, type BoundReviewSourceReference,
  type ReviewSourceReferenceCoordinates } from "../core/review-source-reference.js";
import { resolveReviewInvocation, type ReviewInvocationContext, type ReviewInvocationInput } from "./invocation.js";
import { resolveReviewOperationInvocation, ReviewContinuationReferenceError } from "./continuation-invocation.js";

/** The project and work item a native invocation's source references must name; none for the in-repo arm. */
export async function selectedSourceOwner(input: ReviewInvocationContext): Promise<ReviewSourceReferenceOwner | undefined> {
  if (!input.store.capabilities.stateOffBranch) return undefined;
  const repositoryId = await input.projectId();
  if (input.workItem === undefined) throw new Error("Resolve the native source owner before accessing its reference.");
  return { repositoryId, workItem: input.workItem };
}

/** The commands that emit a review source of this kind, for a remedy that resubmits the reference they emitted. */
export function reviewSourceProducer(kind: BoundReviewSourceReference["kind"]): string {
  return kind === "hosted" ? "arc review hosted await"
    : kind === "frontline" ? "arc review frontline run or arc review reduce"
    : "arc review local attest, arc review local resume, or arc review reduce";
}

function parseProducedSource(value: string, kind: BoundReviewSourceReference["kind"], native: boolean,
  producer: string): BoundReviewSourceReference {
  try { return parseReviewSourceReference(value, kind, native); }
  catch (error) {
    throw new ReviewContinuationReferenceError(error instanceof Error ? error.message : "malformed review source reference", producer);
  }
}

/** Publish the selected native owner outside source identities while preserving repository encodings. */
export async function bindReviewSourceReferenceForInvocation(options: ReviewInvocationInput,
  reference: ReviewSourceReferenceCoordinates): Promise<string> {
  const owner = await selectedSourceOwner(resolveReviewInvocation(options));
  return bindReviewSourceReference({ ...reference, ...owner });
}

/** Validate a source's kind and native coordinates while retaining project repair and internal bound calls. */
export async function resolveReviewSourceInvocation(options: ReviewInvocationInput,
  value: string, kind: BoundReviewSourceReference["kind"]): Promise<{
    invocation: ReviewInvocationInput; reference: BoundReviewSourceReference;
  }> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  const producer = reviewSourceProducer(kind);
  const native = input.store.capabilities.stateOffBranch;
  if (native) await input.projectId();
  const reference = parseProducedSource(value, kind, native, producer);
  if (!("workItem" in reference)) {
    if (native && input.workItem === undefined) throw new ReviewContinuationReferenceError(
      "native continuation requires an owner-bearing source reference", producer);
    return { invocation: input, reference };
  }
  const invocation = await resolveReviewOperationInvocation(input, { operationId: reference.operationId,
    operationRef: bindNativeReviewOperationReference({ repositoryId: reference.repositoryId,
      workItem: reference.workItem, operationId: reference.operationId }) }, producer);
  return { invocation, reference };
}

/** Decode a source for a consumer whose invocation has already selected its storage owner. */
export async function parseReviewSourceReferenceForInvocation(options: ReviewInvocationInput, value: string,
  kind: BoundReviewSourceReference["kind"]): Promise<BoundReviewSourceReference> {
  const owner = await selectedSourceOwner(resolveReviewInvocation(options));
  return parseReviewSourceReferenceForOwner(value, kind, owner);
}
