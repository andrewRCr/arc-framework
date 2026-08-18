/** Production assembly for approved review dispositions. */

import { readConfigSettings } from "../../../lib/config/status-reader.js";
import type { GitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { resolveActiveWu } from "../../../lib/release/wu-resolution.js";
import { getFrameworkVersion } from "../../../lib/version.js";
import {
  readCandidateRecordVersioned,
  writeCandidateRecord,
} from "../../../lib/work-unit/candidate-record-store.js";
import {
  collectGitCandidateTarget,
  collectUnstagedReviewablePaths,
} from "../../../lib/work-unit/git-candidate-subject.js";
import {
  LocalApprovedDispositionRecordStore,
} from "../hosts/local/disposition-record-store.js";
import { settleLaneAttempt } from "../lane-progress.js";
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
    readCandidateLineage: async () => {
      const active = await resolveActiveWu({ cwd: input.cwd });
      if (active.status !== "resolved" || active.name === "") return null;
      const { record, version } = await readCandidateRecordVersioned(input.cwd, active.name);
      if (record === null || version === null) return null;
      const { settings } = await readConfigSettings(input.cwd);
      return {
        workUnit: active.name,
        record,
        recordVersion: version,
        current: await collectGitCandidateTarget({
          cwd: input.cwd,
          name: active.name,
          baseBranch: settings["branch.base"],
          exec: input.exec,
        }),
        unstagedReviewablePaths: await collectUnstagedReviewablePaths({
          cwd: input.cwd,
          name: active.name,
          exec: input.exec,
        }),
      };
    },
    // Staged like the record `attest` publishes: the Candidate's own projection never enters the
    // reviewable subject, so staging it advances the lineage without disturbing what review sees.
    appendCandidateResponse: async ({ workUnit, record, expectedRecordVersion }) => {
      const recordPath = await writeCandidateRecord(input.cwd, workUnit, record, expectedRecordVersion);
      await input.exec("git", ["add", "--", recordPath], { cwd: input.cwd });
      return { recordPath };
    },
    settleLaneFindings: async (settlement) => {
      await settleLaneAttempt(prepare.operationStore, {
        ...settlement,
        now: new Date().toISOString(),
      });
    },
  };
}
