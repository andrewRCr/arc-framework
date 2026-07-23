/** Production assembly for read-only advisory review reduction. */

import type { GitExec } from "../../../lib/git/exec.js";
import { LocalApprovedDispositionRecordStore } from "../hosts/local/disposition-record-store.js";
import { LocalFrontlineOutcomeStore } from "../hosts/local/frontline-outcome-store.js";
import {
  RepositoryGitCommonStatePublisher,
  resolveRepositoryIdentity,
} from "../hosts/local/git-common-state.js";
import { LocalForwardReviewReceiptStore } from "../hosts/local/receipt-store.js";
import { createLocalPrepareDependencies } from "./local-prepare-composition.js";
import {
  DurableReviewReductionPort,
  type ReduceCommandDependencies,
  type ReviewReductionAdapterDependencies,
} from "./reduce-command.js";

/** Bind reduction to repository-common read stores and trusted target confirmation. */
export function createReduceDependencies(input: {
  exec: GitExec;
  cwd: string;
}): ReduceCommandDependencies {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const prepare = createLocalPrepareDependencies(input);
  let receiptStore: Promise<LocalForwardReviewReceiptStore> | null = null;
  const receipts = () => {
    receiptStore ??= resolveRepositoryIdentity(publisher)
      .then((repositoryId) => new LocalForwardReviewReceiptStore(publisher, repositoryId));
    return receiptStore;
  };
  const dependencies: ReviewReductionAdapterDependencies = {
    operationStore: prepare.operationStore,
    sourceStore: prepare.sourceStore,
    outcomeStore: new LocalFrontlineOutcomeStore(publisher),
    dispositionStore: new LocalApprovedDispositionRecordStore(publisher),
    readReceiptEntries: async (targetId) => (await receipts()).readReceiptEntries(targetId),
    confirmTarget: (target) => prepare.confirmTarget(target),
  };
  return { reductionPort: new DurableReviewReductionPort(dependencies) };
}
