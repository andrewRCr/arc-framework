/** Read an original clone-local source descriptor without reviving ended execution. */
import type { LocalReviewSource } from "../core/local-review-source.js";
import type { LocalReviewSourceStore, ReviewOperationStateStore } from "../core/ports.js";

/** Return only a retained descriptor and its actual locator, leaving result checks to the caller. */
export async function readRetainedLocalReviewSource(context: {
  operationStore: Pick<ReviewOperationStateStore, "readLocalSourceReference">;
  sourceStore: Pick<LocalReviewSourceStore, "readSource">;
}, operationId: string): Promise<{ sourceRef: string; source: LocalReviewSource } | null> {
  const sourceRef = await context.operationStore.readLocalSourceReference?.(operationId);
  if (sourceRef === undefined || sourceRef === null) return null;
  const source = await context.sourceStore.readSource(sourceRef);
  return source === null ? null : { sourceRef, source };
}
