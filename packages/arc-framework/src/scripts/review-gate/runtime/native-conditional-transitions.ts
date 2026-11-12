/** Existing lane-transition results are composed around native immutable conditional authority. */
import type { NativeReviewFactPorts, ReviewOperationStateStore, ReviewOperationStateSnapshotIndex } from "../core/ports.js";
import type { captureConditionalNextPassAuthorization, withdrawConditionalNextPassAuthorization, inspectConditionalNextPassInvalidation, invalidateConditionalNextPassAuthorization } from "../lane-progress-conditional.js";
import { readLaneProgressOwner } from "../lane-progress.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import { inspectNativeConditionalPassSupersession } from "./native-conditional-supersession.js";
import { publishNativeConditionalWithdrawal } from "./native-conditional-withdrawal.js";
import { publishNativeConditionalPass } from "./native-conditional-pass.js";

/** Capture authority in the selected native family and return its composed lane without storing status. */
export async function captureNativeConditionalPassTransition(facts: NativeReviewFactPorts, store: ReviewOperationStateStore,
  input: Parameters<typeof captureConditionalNextPassAuthorization>[1]): ReturnType<typeof captureConditionalNextPassAuthorization> {
  const decision = await publishNativeConditionalPass({ ...facts, capture: input });
  const progress = await readLaneProgressOwner(store, input);
  if (progress === null) throw new Error("Restore the captured pass's producer outcome before replaying its lane transition.");
  return { progress, authorizationId: reviewDecisionKey(decision.value) };
}

function nativeExecutionIndex(store: ReviewOperationStateStore): ReviewOperationStateSnapshotIndex {
  const read = (store as Partial<ReviewOperationStateSnapshotIndex>).readOperationSnapshot;
  if (typeof read !== "function") throw new Error("Bind the native execution snapshot reader before retrying this conditional transition.");
  return { readOperationSnapshot: () => read.call(store) };
}

/** Withdraw through portable authority while returning the existing composed transition result. */
export async function withdrawNativeConditionalPassTransition(facts: NativeReviewFactPorts, store: ReviewOperationStateStore,
  input: Parameters<typeof withdrawConditionalNextPassAuthorization>[1]): ReturnType<typeof withdrawConditionalNextPassAuthorization> {
  const result = await publishNativeConditionalWithdrawal({ ...facts, withdrawal: input, inFlight: nativeExecutionIndex(store) });
  if (result.state === "refused") return result;
  const progress = await readLaneProgressOwner(store, input);
  if (progress === null) throw new Error("Restore the withdrawn pass's producer outcome before replaying its lane transition.");
  return { state: result.state, authorizationId: result.authorizationId, dispositionSetId: result.dispositionSetId, progress };
}

/** Inspect native consumption through the existing conditional-succession transition contract. */
export async function inspectNativeConditionalPassTransition(facts: NativeReviewFactPorts, store: ReviewOperationStateStore,
  input: Parameters<typeof inspectConditionalNextPassInvalidation>[1]): ReturnType<typeof inspectConditionalNextPassInvalidation> {
  return inspectNativeConditionalPassSupersession({ ...facts, inFlight: nativeExecutionIndex(store), supersession: input });
}

/** Confirm the atomic successor link instead of writing invalidation status into native execution. */
export async function invalidateNativeConditionalPassTransition(facts: NativeReviewFactPorts, store: ReviewOperationStateStore,
  input: Parameters<typeof invalidateConditionalNextPassAuthorization>[1]): ReturnType<typeof invalidateConditionalNextPassAuthorization> {
  const preflight = await inspectNativeConditionalPassTransition(facts, store, input);
  if (preflight.state === "refused") throw new Error(preflight.detail);
  const predecessor = await facts.evidence.read(input.dispositionSetId);
  if (predecessor === null) throw new Error("Restore the predecessor approval before replaying conditional supersession.");
  if (predecessor.value.successorDispositionSetId !== input.successorDispositionSetId) {
    throw new Error("Approve the exact successor response before replaying conditional supersession.");
  }
  return readLaneProgressOwner(store, input);
}
