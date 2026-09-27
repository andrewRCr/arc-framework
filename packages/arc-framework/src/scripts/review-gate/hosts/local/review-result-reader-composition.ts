/** Production composition for immutable review results over repository-common stores. */

import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import type { ForwardReviewReceiptIndex, ReviewResultReader } from "../../core/ports.js";
import { LocalFrontlineOutcomeStore } from "./frontline-outcome-store.js";
import { resolveRepositoryIdentity } from "./git-common-state.js";
import { LocalReviewOperationStateStore } from "./operation-state-store.js";
import { LocalForwardReviewReceiptStore } from "./receipt-store.js";
import { LocalReviewResultReader } from "./review-result-reader.js";
import { RepositoryLocalReviewSourceStore } from "./source-store.js";

/**
 * Compose the source-neutral result reader from the existing repository-common stores.
 *
 * @param publisher - Repository-common persistence boundary shared by every native store.
 * @returns One storage-neutral reader over local, frontline, and hosted producer evidence.
 */
export function createRepositoryReviewResultReader(
  publisher: GitCommonStatePublisher,
): ReviewResultReader {
  let receiptStore: Promise<LocalForwardReviewReceiptStore> | null = null;
  const receipts = () => {
    receiptStore ??= resolveRepositoryIdentity(publisher)
      .then((repositoryId) => new LocalForwardReviewReceiptStore(publisher, repositoryId));
    return receiptStore;
  };
  const receiptIndex: ForwardReviewReceiptIndex = {
    readReceiptEntries: async (targetId) => (await receipts()).readReceiptEntries(targetId),
    readReceiptReference: async (reference) => (await receipts()).readReceiptReference(reference),
  };
  return new LocalReviewResultReader({
    operationIndex: new LocalReviewOperationStateStore(publisher),
    receiptIndex,
    outcomeStore: new LocalFrontlineOutcomeStore(publisher),
    sourceStore: new RepositoryLocalReviewSourceStore(publisher),
  });
}
