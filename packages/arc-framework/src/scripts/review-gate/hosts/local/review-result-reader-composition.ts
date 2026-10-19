/** Production composition for immutable review results over repository-common stores. */

import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import type { ForwardReviewReceiptIndex, ReviewResultReader } from "../../core/ports.js";
import type { ReviewInvocationOptions } from "../../runtime/invocation.js";
import { bindReviewFamilyPorts } from "../../runtime/family-ports.js";
import { LocalApprovedDispositionRecordStore } from "./disposition-record-store.js";
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
  invocation?: ReviewInvocationOptions,
): ReviewResultReader {
  let receiptStore: Promise<LocalForwardReviewReceiptStore> | null = null;
  const receipts = () => {
    receiptStore ??= resolveRepositoryIdentity(publisher)
      .then((repositoryId) => new LocalForwardReviewReceiptStore(publisher, repositoryId));
    return receiptStore;
  };
  return composeResultReader(publisher, receipts, invocation);
}

/** Compose immutable result reads without locks, initialization, or state publication. */
export function createReadOnlyRepositoryReviewResultReader(
  publisher: Pick<GitCommonStatePublisher, "read" | "list">, repositoryId: string,
  invocation?: ReviewInvocationOptions,
): ReviewResultReader {
  const readOnly: GitCommonStatePublisher = {
    read: (location, name) => publisher.read(location, name),
    list: location => publisher.list(location),
    update: () => Promise.reject(new Error("Read-only review result access cannot publish state.")),
    snapshot: async location => Promise.all((await publisher.list(location)).map(async entry => {
      if (entry.kind !== "file") return { name: entry.name, kind: "other" as const };
      const content = await publisher.read(location, entry.name);
      if (content === null) throw new Error("Review history changed during the read. Retry the lane read.");
      return { ...entry, kind: "file" as const, content };
    })),
  };
  const receipts = new LocalForwardReviewReceiptStore(readOnly, repositoryId);
  return composeResultReader(readOnly, () => Promise.resolve(receipts), invocation);
}

function composeResultReader(publisher: GitCommonStatePublisher,
  receipts: () => Promise<LocalForwardReviewReceiptStore>,
  invocation?: ReviewInvocationOptions,
): ReviewResultReader {
  const family = bindReviewFamilyPorts({ store: invocation?.store, owner: invocation?.workItem, repository: {
    inFlight: new LocalReviewOperationStateStore(publisher), dispositions: new LocalApprovedDispositionRecordStore(publisher),
  } });
  const receiptIndex: ForwardReviewReceiptIndex = {
    readReceiptEntries: async (targetId) => (await receipts()).readReceiptEntries(targetId),
    readReceiptReference: async (reference) => (await receipts()).readReceiptReference(reference),
  };
  return new LocalReviewResultReader({
    operationIndex: family.ports.inFlight,
    receiptIndex,
    outcomeStore: new LocalFrontlineOutcomeStore(publisher),
    sourceStore: new RepositoryLocalReviewSourceStore(publisher),
  });
}
