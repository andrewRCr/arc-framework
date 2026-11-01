/** Select native hosted owners and publish their locators outside provider and result identities. */
import type { z } from "zod";
import { sameOwner, type OwnerIdentity } from "../../../lib/store/identity.js";
import { bindReviewSourceReference, parseReviewSourceReference } from "../core/review-source-reference.js";
import { bindNativeReviewOperationReference } from "../core/review-operation-reference.js";
import { HostedRequestResultSchema, hostedAwaitAction, type HostedRequestEnvelope,
  type HostedRequestResult } from "../hosted/request.js";
import { createReviewCompositionContext } from "./composition-context.js";
import { laneProgressOperationId } from "../lane-progress.js";
import { HostedAwaitCommandResultSchema, type HostedAwaitEnvelope } from "../hosted/await.js";
import type { HostedRequestOwnerIndexRecord } from "../hosts/local/hosted-request-owner-index.js";
import { readLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { resolveNamedReviewWorkUnitInvocation } from "./review-work-unit.js";
import { resolveReviewInvocation, type ReviewInvocationInput, type ReviewInvocationOptions } from "./invocation.js";
import { resolveReviewOperationInvocation, ReviewContinuationReferenceError } from "./continuation-invocation.js";
import { requireReviewWorkItem } from "../../../lib/store/kinds/review/access-shared.js";

/** Use the indexed request owner for replay, otherwise retain the existing fresh vehicle selection. */
export async function resolveHostedRequestInvocation(options: ReviewInvocationInput,
  request: HostedRequestEnvelope, indexed: HostedRequestOwnerIndexRecord | null): Promise<ReviewInvocationInput> {
  const input = { ...options, ...resolveReviewInvocation(options, request) };
  if (!input.store.capabilities.stateOffBranch) return input;
  // An entry naming no owner was written before the flip, so native selection passes over it.
  if (indexed?.workItem !== undefined) {
    if (input.workItem !== undefined && !sameOwner(input.workItem, indexed.workItem)) {
      throw new ReviewContinuationReferenceError("hosted request index names another work item", "arc review hosted request");
    }
    return { ...input, workItem: input.workItem ?? indexed.workItem };
  }
  if (input.workItem !== undefined) return input;
  if (request.vehicle?.kind === "delivery-member") {
    const workUnitId = request.vehicle.workUnitId;
    const selected = await resolveNamedReviewWorkUnitInvocation(input, workUnitId);
    if (selected.workItem === undefined) throw Object.assign(new Error(`The delivery member's work unit \`${workUnitId}\` `
      + "is not stored. Name the member's stored work unit, then retry arc review hosted request -."), { code: "invalid-input" });
    return selected;
  }
  const live = await readLocalReviewLiveContext(input);
  if (live.workItem === undefined) throw new Error("Hosted review progress requires one active work unit or an explicit vehicle.");
  return { ...input, workItem: live.workItem };
}

/** Bind await from the acknowledged admission locator before inspecting pending state or opening review ports. */
export async function resolveHostedAwaitInvocation(options: ReviewInvocationInput,
  request: HostedAwaitEnvelope): Promise<ReviewInvocationInput> {
  const admission = request.handle.admission;
  const input = await resolveReviewOperationInvocation(options,
    { operationId: admission.admissionId, operationRef: request.operationRef }, "arc review hosted request");
  if (!input.store?.capabilities.stateOffBranch || (options.workItem !== undefined && request.operationRef === undefined)) return input;
  const operations = createReviewCompositionContext(input).family.ports.inFlight;
  const { state } = await operations.readOperation(laneProgressOperationId({ lane: "standard", repositoryId: admission.repositoryId,
    headSha: admission.reviewTarget.headSha, lineage: admission.lineage }));
  if (state !== null && state.kind !== "lane-progress") throw new Error(
    "Hosted pending state is not lane progress. Restore the admitted working-state record, then retry.");
  return input;
}

/** Keep native index metadata absent from the repository arm. */
export function hostedRequestIndexWorkItem(input: ReviewInvocationOptions): OwnerIdentity | undefined {
  return input.store?.capabilities.stateOffBranch === true ? input.workItem : undefined;
}

/** Add the selected owner's locator after request acknowledgement without changing the hashed handle. */
export async function retainHostedRequestReference(options: ReviewInvocationInput,
  resultInput: unknown): Promise<HostedRequestResult> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  const result = HostedRequestResultSchema.parse(resultInput);
  if (!input.store.capabilities.stateOffBranch || result.state !== "requested") return result;
  const workItem = requireReviewWorkItem(input.workItem, "A native hosted reference");
  const operationRef = bindNativeReviewOperationReference({ repositoryId: await input.projectId(),
    workItem, operationId: result.handle.admission.admissionId });
  return { ...result, operationRef, action: hostedAwaitAction(result.handle, operationRef) };
}

/** Publish continuation coordinates only after the hosted result has been sealed under its existing identity. */
export async function retainHostedAwaitReference(options: ReviewInvocationInput,
  resultInput: unknown): Promise<z.infer<typeof HostedAwaitCommandResultSchema>> {
  const input = { ...options, ...resolveReviewInvocation(options) };
  const result = HostedAwaitCommandResultSchema.parse(resultInput);
  if (!input.store.capabilities.stateOffBranch) return result;
  const workItem = requireReviewWorkItem(input.workItem, "A native hosted reference");
  const operationRef = bindNativeReviewOperationReference({ repositoryId: await input.projectId(),
    workItem, operationId: result.handle.admission.admissionId });
  const source = "responseSourceRef" in result && result.responseSourceRef !== undefined
    ? parseReviewSourceReference(result.responseSourceRef, "hosted", true) : undefined;
  const responseSourceRef = source === undefined ? undefined
    : bindReviewSourceReference({ ...source, repositoryId: await input.projectId(), workItem });
  return HostedAwaitCommandResultSchema.parse({ ...result, operationRef,
    ...(responseSourceRef === undefined ? {} : { responseSourceRef }),
    ...("action" in result ? { action: hostedAwaitAction(result.handle, operationRef) } : {}) });
}
