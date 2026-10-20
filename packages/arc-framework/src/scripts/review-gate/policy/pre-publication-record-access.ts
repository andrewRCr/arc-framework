/** Lazy fact readers let pre-publication select its named primary before requiring a review family. */
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import type { ApprovedDispositionRecordReader, ReviewInFlightPort, ReviewResultReader } from "../core/ports.js";
import { createRepositoryReviewResultReader } from "../hosts/local/review-result-reader-composition.js";
import { createReviewCompositionContext, type ReviewCompositionContext } from "../runtime/composition-context.js";
import type { ReviewInvocationInput, ReviewInvocationContext } from "../runtime/invocation.js";

/** Retain one family once needed; native Candidate absence requires no family access. */
export function createPrePublicationRecordAccess(input: ReviewInvocationInput & ReviewInvocationContext): {
  publisher: RepositoryGitCommonStatePublisher;
  operationStore: ReviewInFlightPort;
  resultReader: ReviewResultReader;
  dispositionStore: ApprovedDispositionRecordReader;
} {
  let context: ReviewCompositionContext | undefined = input.store.capabilities.stateOffBranch
    ? undefined : createReviewCompositionContext(input);
  const family = () => (context ??= createReviewCompositionContext(input)).family.ports;
  const publisher = context?.publisher ?? new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  let resultReader: ReviewResultReader | undefined;
  return { publisher,
    operationStore: {
      get nativeFacts() { return family().inFlight.nativeFacts; },
      stateOffBranch: input.store.capabilities.stateOffBranch,
      readOperation: operationId => family().inFlight.readOperation(operationId),
      readOperationSnapshot: () => family().inFlight.readOperationSnapshot(),
      publishOperation: (state, expectedVersion) => family().inFlight.publishOperation(state, expectedVersion),
    },
    resultReader: { readResult: producerId => (resultReader ??= createRepositoryReviewResultReader(publisher, input)).readResult(producerId) },
    dispositionStore: { readDispositionRecord: producerId => family().dispositions.readDispositionRecord(producerId) },
  };
}
