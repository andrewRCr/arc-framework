/** Lazy fact readers let pre-publication select its named primary before requiring a review family. */
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import type { ApprovedDispositionRecordReader, ReviewInFlightPort, ReviewLaneTransitionStore, ReviewResultReader } from "../core/ports.js";
import { createRepositoryReviewResultReader } from "../hosts/local/review-result-reader-composition.js";
import { createReviewCompositionContext, type ReviewCompositionContext } from "../runtime/composition-context.js";
import type { ReviewInvocationInput, ReviewInvocationContext } from "../runtime/invocation.js";

/** Retain one family once needed; native Candidate absence requires no family access. */
export function createPrePublicationRecordAccess(input: ReviewInvocationInput & ReviewInvocationContext): {
  publisher: RepositoryGitCommonStatePublisher;
  operationStore: ReviewInFlightPort & Pick<ReviewLaneTransitionStore, "outcomeWriter">;
  resultReader: ReviewResultReader;
  dispositionStore: ApprovedDispositionRecordReader;
} {
  let context: ReviewCompositionContext | undefined = input.store.capabilities.stateOffBranch
    ? undefined : createReviewCompositionContext(input);
  const bound = () => (context ??= createReviewCompositionContext(input)).family;
  const family = () => bound().ports;
  const publisher = context?.publisher ?? new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  let resultReader: ReviewResultReader | undefined;
  return { publisher,
    operationStore: {
      get nativeFacts() { return family().inFlight.nativeFacts; },
      get outcomeWriter() { const selected = bound(); return selected.mode === "stored" ? selected.ports.outcomes : undefined; },
      stateOffBranch: input.store.capabilities.stateOffBranch,
      readLocalSourceReference: async operationId => await family().inFlight.readLocalSourceReference?.(operationId) ?? null,
      readOperation: operationId => family().inFlight.readOperation(operationId),
      readOperationSnapshot: () => family().inFlight.readOperationSnapshot(),
      publishOperation: (state, expectedVersion) => family().inFlight.publishOperation(state, expectedVersion),
    },
    resultReader: { readResult: producerId => (resultReader ??= createRepositoryReviewResultReader(publisher, input)).readResult(producerId) },
    dispositionStore: { readDispositionRecord: producerId => family().dispositions.readDispositionRecord(producerId) },
  };
}
