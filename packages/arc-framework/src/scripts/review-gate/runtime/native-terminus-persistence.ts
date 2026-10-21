/** Persist native terminus authority atomically with its publication boundary. */
import { prepareSubmissionBoundaryPut, SubmissionBoundaryVersionConflictError } from
  "../../../lib/store/kinds/review/integration-boundary/access.js";
import { unwrapReviewRecordResult } from "../../../lib/store/kinds/review/access-shared.js";
import { IntegrationBoundaryLocusV2Schema } from "../policy/integration-boundary-locus-v2.js";
import type { ReviewFactPut } from "../core/ports.js";
import { resolveReviewInvocation, type ReviewInvocationInput } from "./invocation.js";

/** Commit a prepared decision and its boundary as one checked backend batch. */
export async function persistNativeTerminusBoundary(input: ReviewInvocationInput, boundaryInput: unknown,
  expectedVersion: string | null, decision: ReviewFactPut): Promise<void> {
  const bound = resolveReviewInvocation(input);
  if (!bound.store.capabilities.stateOffBranch || bound.workItem === undefined) {
    throw new Error("Resolve the native owning work item before recording its review terminus, then retry.");
  }
  const boundary = IntegrationBoundaryLocusV2Schema.parse(boundaryInput);
  const result = await bound.store.batch({ writes: [decision, prepareSubmissionBoundaryPut(boundary, expectedVersion, bound.workItem)],
    provenance: { verb: "write-submission-boundary", lifecycleAction: "edit" } });
  if (result.status === "refused" && result.refusal.code === "version-conflict"
    && result.refusal.records.every(reference => reference.kind === "review/integration-boundary")) {
    throw new SubmissionBoundaryVersionConflictError();
  }
  unwrapReviewRecordResult(result);
}

/** Record an accepted decision when the current call leaves its publication boundary unfinished. */
export async function persistNativeTerminusDecision(input: ReviewInvocationInput, decision: ReviewFactPut): Promise<void> {
  const bound = resolveReviewInvocation(input);
  if (!bound.store.capabilities.stateOffBranch || bound.workItem === undefined) {
    throw new Error("Resolve the native owning work item before recording its review terminus, then retry.");
  }
  unwrapReviewRecordResult(await bound.store.write({ ...decision, provenance: { verb: "review", lifecycleAction: "edit" } }));
}
