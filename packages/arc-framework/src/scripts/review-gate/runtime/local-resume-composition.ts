/** Production adapters for the local review resume command. */

import type { GitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import type { ForwardReviewReceiptStore } from "../core/ports.js";
import {
  LocalApprovedDispositionRecordStore,
} from "../hosts/local/disposition-record-store.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import { LocalForwardReviewReceiptStore } from "../hosts/local/receipt-store.js";
import { createRepositoryReviewResultReader } from
  "../hosts/local/review-result-reader-composition.js";
import {
  ensureLocalReviewSourceMaterialized,
} from "../hosts/local/review-materialization.js";
import { createLocalPrepareDependencies } from "./local-prepare-composition.js";
import type { LocalResumeDependencies } from "./local-resume-command.js";

/** Bind local resume to the same trusted target, sweep, and Git-common stores as preparation. */
export function createLocalResumeDependencies(input: {
  exec: GitExec;
  cwd: string;
}): LocalResumeDependencies {
  const prepare = createLocalPrepareDependencies(input);
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  let receiptStore: Promise<ForwardReviewReceiptStore> | null = null;
  const receipts = async () => {
    receiptStore ??= resolveRepositoryIdentity(publisher)
      .then((repositoryId) => new LocalForwardReviewReceiptStore(publisher, repositoryId));
    return receiptStore;
  };
  return {
    sweep: () => prepare.sweep(),
    withLocalReviewLock: (action) => prepare.withLocalReviewLock(action),
    operationStore: prepare.operationStore,
    sourceStore: prepare.sourceStore,
    receiptStore: {
      readReceipts: async (targetId) => (await receipts()).readReceipts(targetId),
      appendReceipt: async (receipt, expectedLedgerVersion) => (
        (await receipts()).appendReceipt(receipt, expectedLedgerVersion)
      ),
    },
    dispositionStore: new LocalApprovedDispositionRecordStore(publisher),
    resultReader: createRepositoryReviewResultReader(publisher),
    confirmTarget: (target) => prepare.confirmTarget(target),
    materialize: (source) => ensureLocalReviewSourceMaterialized({
      exec: input.exec,
      source,
    }),
    now: () => new Date().toISOString(),
  };
}
