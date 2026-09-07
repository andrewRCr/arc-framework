/** Production adapters for the local review attestation command. */

import type { GitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import {
  resolveRepositoryIdentity,
  withRepositoryReviewSweepLock,
} from "../hosts/local/git-common-state.js";
import {
  inspectLocalReviewSourceMaterialization,
} from "../hosts/local/review-materialization.js";
import {
  RepositoryLocalReviewSourceSweepAdapter,
} from "../hosts/local/source-sweep.js";
import { LocalForwardReviewReceiptStore } from "../hosts/local/receipt-store.js";
import type { ForwardReviewReceiptStore } from "../core/ports.js";
import { LocalAttestCommandError, type LocalAttestDependencies } from "./local-attest-command.js";
import { createLocalPrepareDependencies } from "./local-prepare-composition.js";

/** Bind local attestation to the same trusted facts and Git-common stores as preparation. */
export function createLocalAttestDependencies(input: {
  exec: GitExec;
  cwd: string;
}): LocalAttestDependencies {
  const prepare = createLocalPrepareDependencies(input);
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const sweepAdapter = new RepositoryLocalReviewSourceSweepAdapter(input.exec, input.cwd);
  let receiptStore: Promise<ForwardReviewReceiptStore> | null = null;
  const receipts = async () => {
    receiptStore ??= resolveRepositoryIdentity(publisher)
      .then((repositoryId) => new LocalForwardReviewReceiptStore(publisher, repositoryId));
    return receiptStore;
  };
  return {
    withSourceLock: (action) => withRepositoryReviewSweepLock(input.exec, input.cwd, action),
    operationStore: prepare.operationStore,
    sourceStore: prepare.sourceStore,
    receiptStore: {
      readReceipts: async (targetId) => (await receipts()).readReceipts(targetId),
      appendReceipt: async (receipt, expectedLedgerVersion) => (
        (await receipts()).appendReceipt(receipt, expectedLedgerVersion)
      ),
    },
    resolveAuthority: async (evaluatorIdentity, memberHeadObjectId, deliveryAdmission) => (
      (await prepare.resolveAuthority(evaluatorIdentity, memberHeadObjectId, deliveryAdmission)).authority
    ),
    resolveGuidanceDigest: async (authority, state) => {
      const policy = prepare.resolvePolicy();
      if (policy.status === "unavailable") {
        throw new LocalAttestCommandError("corrupt-state", policy.diagnostics.join(","));
      }
      prepare.validatePolicySelection(policy.binding, authority);
      if (policy.binding.bindingDigest !== state.policyBindingDigest) {
        throw new LocalAttestCommandError("corrupt-state", "local review policy binding changed");
      }
      const assurance = await prepare.composeAssurance(authority);
      if (assurance.status === "refused") {
        throw new LocalAttestCommandError("corrupt-state", assurance.diagnostics.join(","));
      }
      return assurance.guidance.guidanceDigest;
    },
    confirmTarget: (target) => prepare.confirmTarget(target),
    inspectMaterialization: (source) => inspectLocalReviewSourceMaterialization({
      exec: input.exec,
      source,
    }),
    releaseMaterialization: (operationId) => sweepAdapter.releaseWithinLock(operationId),
    now: () => new Date().toISOString(),
  };
}
