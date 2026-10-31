/** Invocation-bound review records consumed by delivery correction. */
import { createReviewCompositionContext, type ReviewCompositionContext } from "../scripts/review-gate/runtime/composition-context.js";
import type { ReviewInvocationInput } from "../scripts/review-gate/runtime/invocation.js";
import { resolveReviewPolicyInvocation } from "../scripts/review-gate/runtime/local-review-invocation.js";
import { resolveReviewSourceInvocation } from "../scripts/review-gate/runtime/source-invocation.js";
import { canonicalize, type CanonicalDigest } from "../lib/kernel/index.js";
import { currentApprovedDispositionNode, type ApprovedDispositionRecord } from "../scripts/review-gate/core/advisory-records.js";
import type { ReviewTarget } from "../scripts/review-gate/core/gate-contract-v2-schema.js";
import type { LaneSubjectLineage } from "../scripts/review-gate/core/lane-admission.js";
import { StoredReviewResultReader } from "../scripts/review-gate/hosts/local/stored-result-reader.js";
import { NativeApprovedDispositionRecordStore } from "../scripts/review-gate/runtime/native-disposition-store.js";
import { settleLaneAttempt } from "../scripts/review-gate/lane-progress.js";
import { rethrowNativeRefusal } from "../lib/store/native-refusal.js";

/** Exact producer coordinates needed to settle an approved local member response. */
export interface DeliveryLocalReviewResponse {
  oldTarget: ReviewTarget;
  settlement: {
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    attemptId: string;
    dispositionSetId: CanonicalDigest;
    predecessorDispositionSetId?: CanonicalDigest;
  };
}

/** Open the delivery invocation's review record access only when a consumer needs it. */
export function createDeliveryReviewRecordContext(input: ReviewInvocationInput): () => Promise<ReviewCompositionContext> {
  let context: Promise<ReviewCompositionContext> | undefined;
  return () => context ??= resolveReviewPolicyInvocation(input).then(createReviewCompositionContext);
}

/** Validate a local member response against its admitted producer before publishing performance. */
export async function readDeliveryLocalReviewResponse(input: ReviewInvocationInput,
  record: ApprovedDispositionRecord): Promise<DeliveryLocalReviewResponse | null> {
  if (record.source.kind !== "attested-local" || record.deliveryMember === null) return null;
  let selected;
  try { selected = await resolveReviewSourceInvocation(input, record.source.receiptRef, "attested-local"); }
  catch (error) { rethrowNativeRefusal(error); return null; }
  const context = createReviewCompositionContext(selected.invocation);
  const state = await readLocalProducer(context, selected.reference.operationId);
  const current = currentApprovedDispositionNode(record);
  if (state?.kind !== "local-review" || state.operationId !== record.operationId
    || selected.reference.operationId !== record.operationId || state.repositoryId !== record.repositoryId
    || state.deliveryAdmission === undefined
    || canonicalize(state.deliveryAdmission.vehicle) !== canonicalize(record.deliveryMember)
    || state.target.kind !== "delivery-member" || state.target.targetId !== current.approvedDisposition.dispositionSet.targetId
    || state.target.headSha !== record.deliveryMember.head) return null;
  return { oldTarget: state.target, settlement: { repositoryId: state.repositoryId, headSha: state.target.headSha,
    lineage: state.lineage, attemptId: state.operationId, dispositionSetId: current.approvedDisposition.dispositionSet.dispositionSetId,
    ...(current.predecessorDispositionSetId === null ? {} : { predecessorDispositionSetId: current.predecessorDispositionSetId }) } };
}

async function readLocalProducer(context: ReviewCompositionContext, producerId: string) {
  if (context.family.mode === "stored") {
    const result = await new StoredReviewResultReader({ ...context.family.ports, readProjectId: context.projectId }).readResult(producerId);
    return result.kind === "attested-local" ? { kind: "local-review" as const, operationId: result.producerId,
      repositoryId: result.repositoryId, target: result.target, lineage: result.admission.lineage,
      deliveryAdmission: result.deliveryAdmission } : null;
  }
  return (await context.family.ports.inFlight.readOperation(producerId)).state;
}

/** Publish a verified member response and settle its local producer, when present. */
export async function publishDeliveryReviewFixResponse(context: ReviewCompositionContext, input: {
  record: ApprovedDispositionRecord | null;
  settlement: DeliveryLocalReviewResponse["settlement"] | null;
  producedHeadSha: string;
  verifiedAt: string;
}): Promise<void> {
  const writer = context.family.mode === "stored" ? new NativeApprovedDispositionRecordStore({ ...context.family.ports,
    store: context.store, readProjectId: context.projectId, now: () => input.verifiedAt }) : context.family.ports.dispositions;
  if (input.record !== null) await writer.appendDispositionRecord(input.record);
  if (input.settlement !== null) await settleLaneAttempt(context.family.ports.inFlight, {
    lane: "standard", ...input.settlement, producedHeadSha: input.producedHeadSha, now: input.verifiedAt,
  });
}
