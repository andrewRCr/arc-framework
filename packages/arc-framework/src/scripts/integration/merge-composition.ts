/** Production boundaries for the exact-checkpoint integration merge. */

import { z } from "zod";

import { readConfigSettings } from "../../lib/config/status-reader.js";
import {
  createCurrentBaseDriftAdapters,
  workUnitPathTreatmentContext,
} from "../../lib/base-drift/current-adapters.js";
import { runBaseDrift } from "../../lib/git/base-distance.js";
import { getCurrentBranch, resolveIdentity, type GitExec } from "../../lib/git/index.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { createUserSurfaceResolver } from "../../lib/user-surfaces.js";
import {
  resolveChangeRequest,
  type ChangeRequestResolutionPort,
} from "../review-gate/change-request.js";
import { awaitRequiredChecks } from "../review-gate/checks-await.js";
import { evaluateReviewReadiness } from "../review-gate/readiness.js";
import { createGhChangeRequestResolutionPort } from "../review-gate/hosts/github/change-request.js";
import { resolveAcceptableDeliveryBaseRefs } from
  "../review-gate/core/delivery-member-lookup.js";
import { createGhRequiredChecksPort } from "../review-gate/hosts/github/checks-await.js";
import { GhMergeLockPort } from "../review-gate/hosts/github/merge-lock.js";
import { createGhMergeMethodPolicyPort } from "../review-gate/hosts/github/merge-method.js";
import { createGitTreeReadFs } from "../review-gate/hosts/local/git-tree-fs.js";
import { RepositoryDeliveryMemberLookup } from "../review-gate/hosts/local/delivery-member-lookup.js";
import { readMergeLockSetting } from "../review-gate/hosts/local/merge-lock-config.js";
import { GhHostedReviewPort, hostedGhRunner } from "../review-gate/hosted/gh-process.js";
import { settleHostedFinding } from "../review-gate/hosted/settle.js";
import { holdMergeLock, releaseMergeLock } from "../review-gate/merge-lock.js";
import { MergeMethodSchema, resolveMergeMethod } from "../review-gate/merge-method.js";
import { createRespondDependencies } from "../review-gate/runtime/respond-composition.js";
import { respondToReviewCommand } from "../review-gate/runtime/respond-command.js";
import { readIntegrationCheckpointComposition } from "./checkpoint-store.js";
import {
  type IntegrationMergeDependencies,
  type IntegrationMergeTarget,
} from "./merge.js";
import { executeSettlementPlan } from "./settlement-execution.js";
import {
  readLifecycleSummary,
  type IntegrationLifecycleStoragePort,
} from "./checkpoint-composition.js";

const CHECKS_TIMEOUT_MS = 10 * 60 * 1_000;
const CHECKS_POLL_INTERVAL_MS = 10 * 1_000;
const GitHubMergeResponseSchema = z.object({
  merged: z.boolean(),
  message: z.string(),
  sha: z.string().nullable().optional(),
}).loose();

/** Bind Git, GitHub, review, lifecycle, and checkpoint stores to the merge reducer. */
export function createIntegrationMergeDependencies(input: {
  cwd: string;
  exec: GitExec;
  workUnit: string;
  lifecycleStorage?: IntegrationLifecycleStoragePort;
  changeRequestPort?: ChangeRequestResolutionPort;
}): IntegrationMergeDependencies {
  let settingsPromise: ReturnType<typeof readConfigSettings> | null = null;
  const settings = () => {
    settingsPromise ??= readConfigSettings(input.cwd);
    return settingsPromise;
  };
  const hostedPort = new GhHostedReviewPort(hostedGhRunner);
  const changeRequestPort = input.changeRequestPort
    ?? createGhChangeRequestResolutionPort(input.exec, input.cwd);
  const respondDependencies = createRespondDependencies(input);
  const deliveryMemberLookup = new RepositoryDeliveryMemberLookup({ exec: input.exec, cwd: input.cwd });
  const lockPort = new GhMergeLockPort(
    hostedGhRunner,
    (request) => evaluateReviewReadiness(request, {
      deliveryMemberLookup,
      fs: createGitTreeReadFs({
        cwd: input.cwd,
        revision: request.target.headSha,
        exec: input.exec,
      }),
    }),
    readMergeLockSetting,
  );

  const archiveCadence = async () => (await settings()).settings["archive.cadence"] === "manual"
    ? "manual" as const
    : "with-integration" as const;
  const lifecycleStorage = input.lifecycleStorage ?? {
    readSnapshot: async () => {
      const head = (await input.exec("git", ["rev-parse", "HEAD"], {
        cwd: input.cwd,
        objectAccess: "local-only",
      })).stdout.trim();
      return {
        version: head,
        fs: createGitTreeReadFs({ cwd: input.cwd, revision: head, exec: input.exec }),
      };
    },
  };

  const currentTarget = async (): Promise<IntegrationMergeTarget> => {
    const branch = await getCurrentBranch(input.exec);
    if (branch === null) throw new Error("The integration merge requires an attached branch.");
    const repository = await changeRequestPort.resolveRepository();
    const candidates = (await changeRequestPort.listByHead(repository, branch))
      .filter(({ state }) => state === "OPEN");
    if (candidates.length !== 1 || candidates[0] === undefined) {
      throw new Error("The current integration branch does not identify one open change request.");
    }
    const changeRequest = candidates[0];
    return {
      repository,
      pullRequest: changeRequest.number,
      baseRef: changeRequest.baseRefName,
      headRef: changeRequest.headRefName,
      headSha: changeRequest.headRefOid,
    };
  };

  const liveTarget = async (target: IntegrationMergeTarget): Promise<IntegrationMergeTarget> => {
    const repository = await changeRequestPort.resolveRepository();
    if (repository.toLowerCase() !== target.repository.toLowerCase()) {
      throw new Error("The live repository no longer matches the checkpointed target.");
    }
    const candidates = await changeRequestPort.listByHead(repository, target.headRef);
    const candidate = candidates.find(({ number }) => number === target.pullRequest);
    if (candidate === undefined || candidate.state !== "OPEN") {
      throw new Error("The checkpointed change request is no longer open.");
    }
    return {
      repository,
      pullRequest: candidate.number,
      baseRef: candidate.baseRefName,
      headRef: candidate.headRefName,
      headSha: candidate.headRefOid,
    };
  };

  const lockRequest = async (target: IntegrationMergeTarget) => ({
    schemaVersion: 1 as const,
    treeRoot: input.cwd,
    target: {
      repository: target.repository,
      pullRequest: target.pullRequest,
      headSha: target.headSha,
    },
    vehicle: {
      kind: "work-unit" as const,
      slug: SlugSchema.parse(input.workUnit),
      archiveCadence: await archiveCadence(),
    },
  });

  return {
    readCheckpoint: async (workUnit, handle) => {
      const identity = await resolveIdentity({ exec: input.exec });
      if (identity === null) throw new Error("An ARC identity is required to read the integration checkpoint.");
      const surfaces = createUserSurfaceResolver({ cwd: input.cwd, identity });
      return readIntegrationCheckpointComposition(
        surfaces.workUnitRoot(SlugSchema.parse(workUnit)),
        workUnit,
        handle,
      );
    },
    executeSettlement: async (record) => executeSettlementPlan(record.settlementPlan, {
      settleHosted: (request) => settleHostedFinding(request, { port: hostedPort }),
      settleReviewResponse: ({ request, fixTarget }) => respondToReviewCommand(
        fixTarget === null ? request : { ...request, settledFixTarget: fixTarget },
        respondDependencies,
      ),
    }),
    readStatus: async (workUnit) => {
      const [target, cadence, actualHead] = await Promise.all([
        currentTarget(),
        archiveCadence(),
        input.exec("git", ["rev-parse", "HEAD"], {
          cwd: input.cwd,
          objectAccess: "local-only",
        }).then(({ stdout }) => stdout.trim()),
      ]);
      const snapshot = await lifecycleStorage.readSnapshot();
      const lifecycle = await readLifecycleSummary(
        input.cwd,
        workUnit,
        cadence,
        snapshot.version,
        snapshot.fs,
      );
      return {
        actualHead,
        lifecycleComplete: lifecycle.complete,
        lifecycleVersion: lifecycle.storageVersion,
        target,
      };
    },
    readMerged: async (target) => {
      const resolved = await resolveChangeRequest(
        {
          headRef: target.headRef,
          headSha: target.headSha,
          baseRef: target.baseRef,
          acceptableBaseRefs: await resolveAcceptableDeliveryBaseRefs(
            deliveryMemberLookup,
            target.headSha,
          ),
        },
        changeRequestPort,
      );
      return resolved.state === "merged-at-head"
        && resolved.targetRef.repository === target.repository
        && resolved.candidate.number === target.pullRequest;
    },
    refreshTarget: async (target) => {
      const current = await liveTarget(target);
      if (
        current.repository !== target.repository
        || current.pullRequest !== target.pullRequest
        || current.baseRef !== target.baseRef
        || current.headRef !== target.headRef
      ) {
        throw new Error("The live target no longer identifies the checkpointed change request.");
      }
      return current;
    },
    releaseLock: async (target) => releaseMergeLock(await lockRequest(target), lockPort),
    holdLock: async (target) => holdMergeLock(await lockRequest(target ?? await currentTarget()), lockPort),
    createLockRequest: async (target) => lockRequest(target ?? await currentTarget()),
    awaitChecks: async (target) => awaitRequiredChecks({
      repository: target.repository,
      pullRequest: target.pullRequest,
      headSha: target.headSha,
      timeoutMs: CHECKS_TIMEOUT_MS,
      pollIntervalMs: CHECKS_POLL_INTERVAL_MS,
    }, {
      port: createGhRequiredChecksPort(hostedGhRunner),
      clock: {
        now: () => Date.now(),
        sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      },
    }),
    resolveMergeMethod: async (repository, stackPosition) => resolveMergeMethod(
      MergeMethodSchema.parse((await settings()).settings["merge.strategy"]),
      createGhMergeMethodPolicyPort(hostedGhRunner),
      repository,
      stackPosition,
    ),
    readConfiguredBase: async () => (await readConfigSettings(input.cwd)).settings["branch.base"],
    readFinalDrift: async () => {
      const config = await readConfigSettings(input.cwd);
      return runBaseDrift({
        exec: input.exec,
        baseBranch: config.settings["branch.base"],
        mode: "authoritative",
        ...createCurrentBaseDriftAdapters(
          input.exec,
          workUnitPathTreatmentContext(input.workUnit),
        ),
      });
    },
    mergePinned: async (target, method) => {
      const result = await hostedGhRunner.run([
        "api", `repos/${target.repository}/pulls/${target.pullRequest}/merge`,
        "--method", "PUT",
        "--raw-field", `sha=${target.headSha}`,
        "--raw-field", `merge_method=${method}`,
      ]);
      const response = GitHubMergeResponseSchema.parse(JSON.parse(result.stdout) as unknown);
      return response.merged
        ? { state: "merged" }
        : { state: "not-merged", detail: response.message };
    },
  };
}
