/** Bind portable command continuations to their original project and exact work-item generation. */
import { sameOwner } from "../../../lib/store/identity.js";
import { ZodError } from "zod";
import { bindNativeReviewOperationReference, parseNativeReviewOperationReference } from "../core/review-operation-reference.js";
import { resolveReviewInvocation, type ReviewInvocationInput } from "./invocation.js";

/** A command reference is invalid; retry with the reference emitted by its matching producer. */
export class ReviewContinuationReferenceError extends Error {
  readonly code = "invalid-input" as const;
  constructor(detail: string, producer: string) {
    super(`${detail}; resubmit the matching reference emitted by ${producer}.`);
    this.name = "ReviewContinuationReferenceError";
  }
}

function referenceIssue(issue: ZodError["issues"][number], fields: readonly string[]): boolean {
  return issue.path.some(part => fields.includes(String(part)))
    || (issue.code === "invalid_union" && issue.errors.some(group => group.some(child => referenceIssue(child, fields))));
}

/** Keep malformed public reference errors actionable before a continuation reaches execution. */
export function reviewContinuationRequestError(mode: string, error: unknown, requestPhase: boolean): unknown {
  if (!requestPhase) return error;
  const producers: Partial<Record<string, string>> = {
    "review-respond": "the matching local attest/resume, frontline run, hosted await, or reduce command",
    "review-hosted-await": "arc review hosted request",
    "review-frontline-run": "arc review frontline resolve",
    "review-local-resume": "arc review local prepare",
    "review-local-attest": "arc review local prepare",
    "review-reduce": "arc review local prepare or arc review frontline resolve",
  };
  const producer = producers[mode];
  const fields = mode === "review-respond" ? ["source", "receiptRef", "outcomeRef", "attemptRef"] : ["operationRef"];
  return producer !== undefined && error instanceof ZodError && error.issues.some(issue => referenceIssue(issue, fields))
    ? new ReviewContinuationReferenceError(error.message, producer) : error;
}

/** Preserve already bound internal authority or select the exact native owner carried by a public continuation. */
export async function resolveReviewOperationInvocation(options: ReviewInvocationInput,
  request: { operationId: string; operationRef?: string }, producer: string): Promise<ReviewInvocationInput> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  const fail = (detail: string) => new ReviewContinuationReferenceError(detail, producer);
  if (!input.store.capabilities.stateOffBranch) {
    if (request.operationRef !== undefined) throw fail("native references require native storage");
    return input;
  }
  const repositoryId = await input.projectId();
  if (request.operationRef === undefined) {
    if (input.workItem !== undefined) return input;
    throw fail("native continuation requires operationRef");
  }
  let reference;
  try { reference = parseNativeReviewOperationReference(request.operationRef); }
  catch { throw fail("malformed native operation reference"); }
  if (reference.repositoryId !== repositoryId) throw fail("operation reference names another project");
  if (reference.operationId !== request.operationId) throw fail("operation reference names another operation");
  if (input.workItem !== undefined && !sameOwner(input.workItem, reference.workItem)) {
    throw fail("operation reference names another work item");
  }
  return { ...input, workItem: input.workItem ?? reference.workItem };
}

function payloadOperationId(payload: object): string | undefined {
  if ("operationId" in payload && typeof payload.operationId === "string") return payload.operationId;
  if (!("admission" in payload) || payload.admission === null || typeof payload.admission !== "object") return undefined;
  return "operationId" in payload.admission && typeof payload.admission.operationId === "string"
    ? payload.admission.operationId : undefined;
}

/** Publish the selected native owner beside a command's unchanged operation ID. */
export async function retainReviewOperationReference<T>(options: ReviewInvocationInput,
  result: T): Promise<T> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  if (result === null || typeof result !== "object" || !("payload" in result)) return result;
  const payload = result.payload;
  if (!input.store.capabilities.stateOffBranch || payload === null || typeof payload !== "object") return result;
  const operationId = payloadOperationId(payload);
  if (operationId === undefined) return result;
  if (input.workItem === undefined) throw new Error("Resolve the native operation owner before publishing its reference.");
  const operationRef = bindNativeReviewOperationReference({ repositoryId: await input.projectId(),
    workItem: input.workItem, operationId });
  return { ...result, payload: { ...payload, operationRef } };
}
