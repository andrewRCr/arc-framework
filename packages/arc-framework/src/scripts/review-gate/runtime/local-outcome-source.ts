/** Read an original clone-local source descriptor without reviving ended execution. */
import type { LocalReviewSource } from "../core/local-review-source.js";
import type { LocalReviewSourceStore, ReviewOperationStateStore } from "../core/ports.js";
import type { StoredReviewFact } from "../core/ports.js";
import type { ReviewOutcome } from "../../../lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../lib/store/kinds/review/outcome/key.js";
import { assertLocalReviewClaimBinding } from "../core/local-operation.js";
import { bindNativeReviewOperationReference } from "../core/review-operation-reference.js";
import { bindReviewSourceReference, type ReviewSourceReferenceBinding } from "../core/review-source-reference.js";

type SourceContext = {
  operationStore: Pick<ReviewOperationStateStore, "readLocalSourceReference">;
  sourceStore: Pick<LocalReviewSourceStore, "readSource">;
};
type RetainedSource = { sourceRef: string; source: LocalReviewSource } | null;

interface EndedLocalReviewBinding {
  operationRef: string;
  receiptReference(): Promise<string>;
  readRetainedSource(sourceRef?: string): Promise<RetainedSource>;
}

/** Bind an ended admission's owner and verify retained source facts at the caller's replay boundary. */
export function bindEndedLocalReview(stored: StoredReviewFact<ReviewOutcome>,
  local: NonNullable<ReviewOutcome["local"]>, context: SourceContext & {
    bindSourceReference?: ReviewSourceReferenceBinding;
  }, sourceMismatch: () => Error): EndedLocalReviewBinding {
  assertLocalReviewClaimBinding(local);
  const outcome = stored.value, operationId = outcome.attemptId, target = outcome.target;
  return {
    operationRef: bindNativeReviewOperationReference({ operationId, repositoryId: target.repositoryId,
      workItem: stored.reference.owner }),
    async receiptReference() {
      const coordinates = { kind: "attested-local" as const, operationId, durableRef: reviewOutcomeKey(outcome) };
      return context.bindSourceReference === undefined
        ? bindReviewSourceReference({ ...coordinates, repositoryId: target.repositoryId, workItem: stored.reference.owner })
        : context.bindSourceReference(coordinates);
    },
    async readRetainedSource(sourceRef) {
      const source = sourceRef === undefined ? await readRetainedLocalReviewSource(context, operationId)
        : await context.sourceStore.readSource(sourceRef).then(value => value === null ? null : { sourceRef, source: value });
      if (source !== null && (source.source.sourceDigest !== local.sourceDigest
        || source.source.repositoryId !== target.repositoryId || source.source.targetId !== target.targetId)) {
        throw sourceMismatch();
      }
      return source;
    },
  };
}

/** Return only a retained descriptor and its actual locator, leaving result checks to the caller. */
export async function readRetainedLocalReviewSource(context: SourceContext,
  operationId: string): Promise<RetainedSource> {
  const sourceRef = await context.operationStore.readLocalSourceReference?.(operationId);
  if (sourceRef === undefined || sourceRef === null) return null;
  const source = await context.sourceStore.readSource(sourceRef);
  return source === null ? null : { sourceRef, source };
}
