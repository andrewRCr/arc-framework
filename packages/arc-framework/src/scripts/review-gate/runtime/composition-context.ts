/** Assemble one invocation's repository adapters and selected durable review ports. */
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { LocalApprovedDispositionRecordStore } from "../hosts/local/disposition-record-store.js";
import { bindReviewFamilyPorts } from "./family-ports.js";
import { resolveReviewInvocation, type ReviewInvocationInput, type ReviewInvocationContext } from "./invocation.js";

/** Shared stores and portable access selected once for a review composition. */
export interface ReviewCompositionContext extends ReviewInvocationContext {
  publisher: RepositoryGitCommonStatePublisher;
  family: ReturnType<typeof bindReviewFamilyPorts>;
}

/** Bind the supplied work item while preserving repository behavior before the backend flip. */
export function createReviewCompositionContext(input: ReviewInvocationInput): ReviewCompositionContext {
  const invocation = resolveReviewInvocation(input);
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const repository = { inFlight: new LocalReviewOperationStateStore(publisher),
    dispositions: new LocalApprovedDispositionRecordStore(publisher) };
  return { ...invocation, publisher, family: bindReviewFamilyPorts({
    store: invocation.store, owner: invocation.workItem, projectId: invocation.projectId, publisher, repository,
  }) };
}
