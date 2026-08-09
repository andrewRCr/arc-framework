/** Production assembly for approved review dispositions. */

import type { GitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { getFrameworkVersion } from "../../../lib/version.js";
import {
  LocalApprovedDispositionRecordStore,
} from "../hosts/local/disposition-record-store.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import {
  LocalFrontlineOutcomeStore,
} from "../hosts/local/frontline-outcome-store.js";
import { readLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { LocalForwardReviewReceiptStore } from "../hosts/local/receipt-store.js";
import type { RespondCommandDependencies } from "./respond-command.js";
import { createLocalPrepareDependencies } from "./local-prepare-composition.js";

/** Bind respond to repository-common records and trusted local/runtime identities. */
export function createRespondDependencies(input: {
  exec: GitExec;
  cwd: string;
}): RespondCommandDependencies {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const prepare = createLocalPrepareDependencies(input);
  let receiptStore: Promise<LocalForwardReviewReceiptStore> | null = null;
  const receipts = () => {
    receiptStore ??= resolveRepositoryIdentity(publisher)
      .then((repositoryId) => new LocalForwardReviewReceiptStore(publisher, repositoryId));
    return receiptStore;
  };
  return {
    operationStore: prepare.operationStore,
    sourceStore: prepare.sourceStore,
    outcomeStore: new LocalFrontlineOutcomeStore(publisher),
    dispositionStore: new LocalApprovedDispositionRecordStore(publisher),
    readReceipt: async (reference) => (await receipts()).readReceiptReference(reference),
    confirmTarget: (target) => prepare.confirmTarget(target),
    resolveLocalActors: async (evaluatorIdentity) => {
      const { authority } = await prepare.resolveAuthority(evaluatorIdentity);
      return {
        approverIdentity: authority.authorIdentity,
        proposerIdentity: authority.runtimeIdentity,
      };
    },
    resolveFrontlineActors: async () => {
      const live = await readLocalReviewLiveContext(input);
      if (live.context.activeIdentity === null) throw new Error("active-identity-missing");
      return {
        approverIdentity: live.context.activeIdentity,
        proposerIdentity: `arc-cli/${getFrameworkVersion()}`,
      };
    },
  };
}
