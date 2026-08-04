/** Production adapters for the local review prepare command. */

import { readConfigSettings } from "../../../lib/config/status-reader.js";
import type { GitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { getFrameworkVersion } from "../../../lib/version.js";
import {
  LocalReviewOperationStateStore,
} from "../hosts/local/operation-state-store.js";
import {
  resolveRepositoryIdentity,
  withRepositoryReviewSweepLock,
} from "../hosts/local/git-common-state.js";
import { RepositoryLocalReviewSourceStore } from "../hosts/local/source-store.js";
import {
  createLocalReviewSourceDescriptor,
  ensureLocalReviewSourceMaterialized,
} from "../hosts/local/review-materialization.js";
import {
  deriveLocalReviewTarget,
  confirmLocalReviewTarget,
} from "../hosts/local/repository-target.js";
import {
  resolveLocalReviewAuthority,
} from "../hosts/local/review-authority.js";
import type { LocalReviewAuthority } from "../core/local-review-authority.js";
import {
  readLocalReviewLiveContext,
  type ResolvedLocalReviewLiveContext,
} from "../hosts/local/live-context.js";
import {
  createLocalReviewMethodFilePort,
  createLocalReviewRubricBindingPort,
} from "../hosts/local/method-files.js";
import {
  composeWorkUnitReviewAssurance,
} from "../policy/assurance.js";
import {
  bindReviewMethodActivity,
  resolveReviewMethodActivity,
} from "../policy/activity.js";
import { projectLocalReviewGuidance } from "../policy/local-review-guidance.js";
import {
  resolveLocalReviewPolicyBinding,
  validateLocalReviewPolicySelection,
} from "../policy/local-review-policy.js";
import { RepositoryLocalReviewSourceSweepAdapter } from "../hosts/local/source-sweep.js";
import { LocalForwardReviewReceiptStore } from "../hosts/local/receipt-store.js";
import { sweepLocalReviewSources } from "../core/local-source-sweep.js";
import type { LocalPrepareDependencies } from "./local-prepare.js";

const LOCAL_STANDARD_SOURCE = {
  sourceKind: "agent",
  qualifier: "standard-review/v1",
} as const;

/** Bind local prepare to the current repository, managed methods, and Git-common stores. */
export function createLocalPrepareDependencies(input: {
  exec: GitExec;
  cwd: string;
}): LocalPrepareDependencies {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const operationStore = new LocalReviewOperationStateStore(publisher);
  const sourceStore = new RepositoryLocalReviewSourceStore(publisher);
  const sweepAdapter = new RepositoryLocalReviewSourceSweepAdapter(input.exec, input.cwd);
  let receiptStore: Promise<LocalForwardReviewReceiptStore> | null = null;
  const receipts = () => {
    receiptStore ??= resolveRepositoryIdentity(publisher)
      .then((repositoryId) => new LocalForwardReviewReceiptStore(publisher, repositoryId));
    return receiptStore;
  };
  let liveContext: Promise<ResolvedLocalReviewLiveContext> | null = null;
  const readLive = () => {
    liveContext ??= readLocalReviewLiveContext(input);
    return liveContext;
  };
  const methodFiles = createLocalReviewMethodFilePort({ cwd: input.cwd });
  const rubricPort = createLocalReviewRubricBindingPort({ cwd: input.cwd });

  return {
    operationStore,
    sourceStore,
    now: () => new Date().toISOString(),
    withSourceLock: (action) => withRepositoryReviewSweepLock(input.exec, input.cwd, action),
    sweep: async () => {
      const receiptStore = await receipts();
      await withRepositoryReviewSweepLock(input.exec, input.cwd, async () => {
        await sweepLocalReviewSources({
          listOperationIds: () => sweepAdapter.listOperationIds(),
          readOperation: (operationId) => operationStore.readOperation(operationId),
          readReceipts: (targetId) => receiptStore.readReceipts(targetId),
          release: (operationId) => sweepAdapter.releaseWithinLock(operationId),
          now: () => new Date().toISOString(),
        });
      });
    },
    readReceipts: async (targetId) => (await receipts()).readReceipts(targetId),
    resolveRepositoryId: () => resolveRepositoryIdentity(publisher),
    deriveTarget: async (repositoryId) => {
      const config = await readConfigSettings(input.cwd);
      return deriveLocalReviewTarget({
        exec: input.exec,
        cwd: input.cwd,
        baseRef: config.settings["branch.base"],
        repositoryId,
      });
    },
    confirmTarget: (target) => confirmLocalReviewTarget({
      exec: input.exec,
      cwd: input.cwd,
      attemptedTarget: target,
    }),
    resolveAuthority: (evaluatorIdentity) => resolveLocalReviewAuthority(
      { evaluatorIdentity },
      {
        readLiveContext: async () => (await readLive()).context,
        resolveRuntimeBinding: () => Promise.resolve({
          kind: "arc-cli",
          identity: `arc-cli/${getFrameworkVersion()}`,
        }),
      },
    ),
    composeAssurance: async (authority: LocalReviewAuthority) => {
      const live = await readLive();
      if (authority.vehicle.kind === "work-unit") {
        if (live.meta === null) return { status: "refused", diagnostics: ["work-unit meta unavailable"] };
        const composed = composeWorkUnitReviewAssurance(live.meta, methodFiles, rubricPort);
        if (composed.status === "refused") {
          return { status: "refused", diagnostics: [...composed.diagnostics] };
        }
        return {
          status: "resolved",
          assurance: composed.assurance.assurance,
          activity: composed.assurance.activity,
          guidance: projectLocalReviewGuidance(
            composed.guidance.projectAugmentation ?? undefined,
          ),
          diagnostics: [...composed.diagnostics],
        };
      }
      const activity = resolveReviewMethodActivity(bindReviewMethodActivity(methodFiles).activityPort);
      return {
        status: "resolved",
        assurance: { workContext: "errand", workClass: "none" },
        activity: activity.activity,
        guidance: projectLocalReviewGuidance(),
        diagnostics: activity.diagnostics,
      };
    },
    resolvePolicy: () => resolveLocalReviewPolicyBinding(null, [LOCAL_STANDARD_SOURCE]),
    validatePolicySelection: (binding, authority) => {
      validateLocalReviewPolicySelection(binding, {
        source: LOCAL_STANDARD_SOURCE,
        runtimeKind: authority.attestationRuntimeKind,
      });
    },
    describeSource: (operationId, target) => createLocalReviewSourceDescriptor({
      exec: input.exec,
      cwd: input.cwd,
      operationId,
      target,
    }),
    materialize: (source) => ensureLocalReviewSourceMaterialized({ exec: input.exec, source }),
  };
}
